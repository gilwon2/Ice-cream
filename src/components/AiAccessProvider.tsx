"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  browserSessionStorage,
  createAiAccessStore,
  verifyAccessCode,
  type AiAccessStore,
} from "@/lib/ai/access";
import { AI_CONSENT_TEXT } from "@/lib/ai/shared";

type AiAccess = {
  store: AiAccessStore;
  /**
   * AI 기능을 쓰기 전에 부른다. 처음이면 개인정보 안내 동의와 접근 코드 입력을 받고,
   * 준비되면 true, 사용자가 취소하면 false를 돌려준다.
   */
  ensureAiAccess: () => Promise<boolean>;
};

const AiAccessContext = createContext<AiAccess | null>(null);

export function useAiAccess(): AiAccess {
  const value = useContext(AiAccessContext);
  if (!value) throw new Error("AiAccessProvider 안에서만 쓸 수 있어요.");
  return value;
}

type Step = "consent" | "code";

export function AiAccessProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createAiAccessStore(browserSessionStorage), []);
  const [step, setStep] = useState<Step | null>(null);
  const resolver = useRef<((ready: boolean) => void) | null>(null);

  const finish = useCallback((ready: boolean) => {
    setStep(null);
    resolver.current?.(ready);
    resolver.current = null;
  }, []);

  const ensureAiAccess = useCallback(() => {
    if (store.hasConsent() && store.getAccessCode()) return Promise.resolve(true);
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setStep(store.hasConsent() ? "code" : "consent");
    });
  }, [store]);

  const value = useMemo(() => ({ store, ensureAiAccess }), [store, ensureAiAccess]);

  return (
    <AiAccessContext.Provider value={value}>
      {children}
      {step && (
        <AiAccessDialog
          step={step}
          store={store}
          onConsent={() => {
            store.giveConsent();
            if (store.getAccessCode()) finish(true);
            else setStep("code");
          }}
          onVerified={() => finish(true)}
          onCancel={() => finish(false)}
        />
      )}
    </AiAccessContext.Provider>
  );
}

type AiAccessDialogProps = {
  step: Step;
  store: AiAccessStore;
  onConsent: () => void;
  onVerified: () => void;
  onCancel: () => void;
};

function AiAccessDialog({ step, store, onConsent, onVerified, onCancel }: AiAccessDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // 모달로 열어 포커스를 대화상자 안에 가두고, Esc로 닫을 수 있게 한다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const submitCode = async () => {
    setPending(true);
    setError("");
    const result = await verifyAccessCode(code, { store });
    setPending(false);
    if (result.ok) {
      onVerified();
      return;
    }
    // 틀리면 입력칸을 비우지 않고 다시 고칠 수 있게 한다.
    setError(result.message);
    codeRef.current?.select();
  };

  return (
    <dialog
      ref={dialogRef}
      className="ai-dialog"
      aria-labelledby="ai-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {step === "consent" ? (
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            onConsent();
          }}
        >
          <h2 id="ai-dialog-title" className="card-title">
            AI 기능 사용 안내
          </h2>
          <p className="ai-dialog-text">{AI_CONSENT_TEXT}</p>
          <p className="hint">
            동의하지 않아도 판정, 진행률, 기본 설명, 문의문·제안문 템플릿은 그대로 쓸 수 있어요.
          </p>
          <div className="ai-dialog-actions">
            <button type="button" className="button button-ghost" onClick={onCancel}>
              취소
            </button>
            <button type="submit" className="button button-primary" autoFocus>
              동의하고 계속
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!pending) void submitCode();
          }}
        >
          <h2 id="ai-dialog-title" className="card-title">
            접근 코드 입력
          </h2>
          <p className="ai-dialog-text">
            AI 기능은 시연용으로 접근 코드가 있어야 쓸 수 있어요. 한 번 입력하면 이 탭을 닫을
            때까지 기억해요.
          </p>
          <label className="field-label" htmlFor="ai-access-code">
            접근 코드
          </label>
          <input
            ref={codeRef}
            id="ai-access-code"
            type="text"
            autoComplete="off"
            value={code}
            aria-invalid={Boolean(error)}
            aria-describedby="ai-access-code-error"
            onChange={(event) => setCode(event.target.value)}
          />
          <p id="ai-access-code-error" className="field-hint is-not_met" aria-live="polite">
            {error}
          </p>
          <div className="ai-dialog-actions">
            <button type="button" className="button button-ghost" onClick={onCancel}>
              취소
            </button>
            <button type="submit" className="button button-primary" disabled={pending}>
              {pending ? "확인 중…" : "확인"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
