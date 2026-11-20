/**
 * 요소의 맨 위가 상단 고정 영역(모바일 진행률 바) 바로 아래에 오도록 부드럽게 스크롤한다.
 *
 * scrollIntoView만 쓰면 레이아웃이 크게 바뀐 직후(STEP 03 → 04처럼 문서 높이가 확 달라질 때)
 * 애니메이션이 늦게 출발하거나 도중에 다른 스크롤·높이 변화가 끼어 목표에 못 미칠 수 있다.
 * 그래서 다음 두 프레임 뒤(레이아웃 확정 후)에 목표를 계산하고, 스크롤이 끝난 뒤
 * 위치가 어긋나 있으면 한 번 더 맞춘다. 오프셋은 CSS의 html scroll-padding-top
 * (상단 바 높이 + 여백)을 그대로 읽어 CSS와 JS가 같은 값을 쓰게 한다.
 */
export function scrollToElement(element: HTMLElement, onDone?: () => void): () => void {
  let cancelled = false;
  let frame = 0;
  let timer = 0;

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const targetTop = () => {
    const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const maxTop = document.documentElement.scrollHeight - window.innerHeight;
    const top = element.getBoundingClientRect().top + window.scrollY - padding;
    return Math.max(0, Math.min(top, maxTop));
  };

  const finish = () => {
    window.removeEventListener("scrollend", finish);
    window.clearTimeout(timer);
    if (cancelled) return;
    // 도중에 높이가 바뀌었거나 애니메이션이 끊겼으면 남은 거리만 즉시 맞춘다.
    const top = targetTop();
    if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: "auto" });
    onDone?.();
  };

  frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => {
      if (cancelled) return;
      const top = targetTop();
      if (prefersReduced || Math.abs(window.scrollY - top) < 2) {
        window.scrollTo({ top, behavior: "auto" });
        onDone?.();
        return;
      }
      window.addEventListener("scrollend", finish, { once: true });
      // scrollend를 지원하지 않는 브라우저를 위한 대비
      timer = window.setTimeout(finish, 1200);
      window.scrollTo({ top, behavior: "smooth" });
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    window.removeEventListener("scrollend", finish);
  };
}
