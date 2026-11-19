import { NATIONAL_EMPLOYMENT } from "./nationalEmployment";
import type { Policy } from "./types";
import { YOUTH_RENT } from "./youthRent";

export { INFO_CHECKED_AT, INQUIRY_TOPICS } from "./common";
export type { Advisory, ExternalSite, Policy, QuestionGroup, RequiredDocument } from "./types";

export const POLICIES: readonly Policy[] = [YOUTH_RENT, NATIONAL_EMPLOYMENT];
