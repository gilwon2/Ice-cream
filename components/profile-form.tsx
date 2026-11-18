"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { policies } from "@/lib/policies";
import {
  EMPLOYMENT_LABELS,
  HOUSING_LABELS,
  profileSchema,
  REGIONS,
  TRI_STATE_LABELS,
  type Profile,
} from "@/lib/profile";
import { clearSession, SESSION_KEYS, useSessionValue, writeSession } from "@/lib/session";

interface FormValues {
  age: string;
  region: string;
  residencyMonths: string;
  employment: string;
  householdSize: string;
  householdMonthlyIncome: string;
  householdIncomeUnknown: boolean;
  personalAnnualIncome: string;
  personalIncomeUnknown: boolean;
  housing: string;
  monthlyRent: string;
  deposit: string;
  independentHousehold: string;
  residentRegistered: string;
  receivingPolicyIds: string[];
}

const EMPTY_VALUES: FormValues = {
  age: "",
  region: "",
  residencyMonths: "",
  employment: "",
  householdSize: "1",
  householdMonthlyIncome: "",
  householdIncomeUnknown: false,
  personalAnnualIncome: "",
  personalIncomeUnknown: false,
  housing: "",
  monthlyRent: "",
  deposit: "",
  independentHousehold: "unknown",
  residentRegistered: "unknown",
  receivingPolicyIds: [],
};

const EXAMPLE_VALUES: FormValues = {
  ...EMPTY_VALUES,
  age: "26",
  region: "대구",
  residencyMonths: "4",
  employment: "unemployed",
  householdMonthlyIncome: "120",
  personalAnnualIncome: "1200",
  housing: "monthly_rent",
  monthlyRent: "45",
  deposit: "500",
  independentHousehold: "unknown",
  residentRegistered: "no",
};

const FIELD_ERRORS: Record<string, string> = {
  age: "만 15~45세 사이의 나이를 입력해 주세요.",
  region: "거주 지역을 선택해 주세요.",
  residencyMonths: "거주 기간을 개월 수로 입력해 주세요.",
  employment: "취업 상태를 선택해 주세요.",
  householdMonthlyIncome: "가구 월 소득을 입력하거나 '잘 모르겠어요'를 선택해 주세요.",
  personalAnnualIncome: "본인 연 소득을 입력하거나 '잘 모르겠어요'를 선택해 주세요.",
  housing: "주거 형태를 선택해 주세요.",
  monthlyRent: "월세를 만 원 단위로 입력해 주세요.",
  deposit: "보증금을 만 원 단위로 입력해 주세요.",
};

const HOUSEHOLD_SIZES = ["1", "2", "3", "4", "5", "6"];

function toFormValues(profile: Profile): FormValues {
  return {
    age: String(profile.age),
    region: profile.region,
    residencyMonths: String(profile.residencyMonths),
    employment: profile.employment,
    householdSize: String(profile.householdSize),
    householdMonthlyIncome: profile.householdMonthlyIncome?.toString() ?? "",
    householdIncomeUnknown: profile.householdMonthlyIncome === null,
    personalAnnualIncome: profile.personalAnnualIncome?.toString() ?? "",
    personalIncomeUnknown: profile.personalAnnualIncome === null,
    housing: profile.housing,
    monthlyRent: profile.housing === "monthly_rent" ? String(profile.monthlyRent) : "",
    deposit: profile.housing === "monthly_rent" ? String(profile.deposit) : "",
    independentHousehold: profile.independentHousehold,
    residentRegistered: profile.residentRegistered,
    receivingPolicyIds: profile.receivingPolicyIds,
  };
}

/** 빈 칸이 0으로 통과하지 않도록 숫자로 바꾼다. */
function toNumber(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}

function toCandidate(values: FormValues) {
  const renting = values.housing === "monthly_rent";
  return {
    age: toNumber(values.age),
    region: values.region,
    residencyMonths: toNumber(values.residencyMonths),
    employment: values.employment,
    householdSize: Number(values.householdSize),
    householdMonthlyIncome: values.householdIncomeUnknown ? null : toNumber(values.householdMonthlyIncome),
    personalAnnualIncome: values.personalIncomeUnknown ? null : toNumber(values.personalAnnualIncome),
    housing: values.housing,
    monthlyRent: renting ? toNumber(values.monthlyRent) : 0,
    deposit: renting ? toNumber(values.deposit) : 0,
    independentHousehold: values.independentHousehold,
    residentRegistered: renting ? values.residentRegistered : "unknown",
    receivingPolicyIds: values.receivingPolicyIds,
  };
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceGroup({
  name,
  label,
  value,
  options,
  error,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: Record<string, string>;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <span id={`${name}-label`} className="text-sm font-medium">
        {label}
      </span>
      <RadioGroup
        aria-labelledby={`${name}-label`}
        value={value}
        onValueChange={(next) => onChange(String(next))}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {Object.entries(options).map(([optionValue, optionLabel]) => (
          <Label
            key={optionValue}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 font-normal has-data-checked:border-primary has-data-checked:bg-secondary"
          >
            <RadioGroupItem value={optionValue} />
            {optionLabel}
          </Label>
        ))}
      </RadioGroup>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function FormFields({ initial }: { initial: FormValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const numberProps = (key: keyof FormValues) => ({
    id: key,
    type: "number",
    inputMode: "numeric" as const,
    min: 0,
    value: values[key] as string,
    "aria-invalid": Boolean(errors[key]),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
    className: "h-11 bg-card",
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = profileSchema.safeParse(toCandidate(values));
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0]);
        next[key] = FIELD_ERRORS[key] ?? "입력값을 확인해 주세요.";
      });
      setErrors(next);
      const firstKey = Object.keys(FIELD_ERRORS).find((key) => next[key]);
      if (firstKey) document.getElementById(firstKey)?.focus();
      return;
    }
    clearSession(SESSION_KEYS.messages, SESSION_KEYS.diagnosis, SESSION_KEYS.checklist);
    writeSession(SESSION_KEYS.profile, parsed.data);
    router.push("/diagnosis");
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <div className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-4 py-3 text-sm text-secondary-foreground">
        <span>처음이라면 예시 프로필로 둘러보세요.</span>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 px-3"
          onClick={() => {
            setValues(EXAMPLE_VALUES);
            setErrors({});
          }}
        >
          예시로 채우기
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="age" label="만 나이" error={errors.age}>
              <Input {...numberProps("age")} placeholder="예: 26" />
            </Field>
            <Field id="region" label="거주 지역" error={errors.region}>
              <Select
                items={REGIONS.map((region) => ({ value: region, label: region }))}
                value={values.region || null}
                onValueChange={(value) => set("region", String(value ?? ""))}
              >
                <SelectTrigger id="region" aria-invalid={Boolean(errors.region)} className="h-11! w-full bg-card">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="residencyMonths" label="거주 기간(개월)" error={errors.residencyMonths}>
              <Input {...numberProps("residencyMonths")} placeholder="예: 12" />
            </Field>
          </div>
          <ChoiceGroup
            name="employment"
            label="취업 상태"
            value={values.employment}
            options={EMPLOYMENT_LABELS}
            error={errors.employment}
            onChange={(value) => set("employment", value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>소득</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <Field id="householdSize" label="가구원 수" hint="6인 이상은 6으로 선택">
            <Select
              items={HOUSEHOLD_SIZES.map((size) => ({ value: size, label: `${size}인` }))}
              value={values.householdSize}
              onValueChange={(value) => set("householdSize", String(value ?? "1"))}
            >
              <SelectTrigger id="householdSize" className="h-11! w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOUSEHOLD_SIZES.map((size) => (
                  <SelectItem key={size} value={size}>
                    {size}인
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="householdMonthlyIncome" label="가구 월 소득(만 원)" error={errors.householdMonthlyIncome}>
            <Input
              {...numberProps("householdMonthlyIncome")}
              disabled={values.householdIncomeUnknown}
              placeholder="예: 250"
            />
            <Label className="mt-1 min-h-6 cursor-pointer font-normal text-muted-foreground">
              <Checkbox
                checked={values.householdIncomeUnknown}
                onCheckedChange={(checked) => set("householdIncomeUnknown", checked === true)}
              />
              잘 모르겠어요
            </Label>
          </Field>
          <Field id="personalAnnualIncome" label="본인 연 소득(만 원)" error={errors.personalAnnualIncome}>
            <Input
              {...numberProps("personalAnnualIncome")}
              disabled={values.personalIncomeUnknown}
              placeholder="예: 2400"
            />
            <Label className="mt-1 min-h-6 cursor-pointer font-normal text-muted-foreground">
              <Checkbox
                checked={values.personalIncomeUnknown}
                onCheckedChange={(checked) => set("personalIncomeUnknown", checked === true)}
              />
              잘 모르겠어요
            </Label>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>주거</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <ChoiceGroup
            name="housing"
            label="주거 형태"
            value={values.housing}
            options={HOUSING_LABELS}
            error={errors.housing}
            onChange={(value) => set("housing", value)}
          />
          {values.housing === "monthly_rent" && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="monthlyRent" label="월세(만 원)" error={errors.monthlyRent}>
                  <Input {...numberProps("monthlyRent")} placeholder="예: 45" />
                </Field>
                <Field id="deposit" label="보증금(만 원)" error={errors.deposit}>
                  <Input {...numberProps("deposit")} placeholder="예: 500" />
                </Field>
              </div>
              <ChoiceGroup
                name="residentRegistered"
                label="현재 집에 전입신고를 했나요?"
                value={values.residentRegistered}
                options={TRI_STATE_LABELS}
                onChange={(value) => set("residentRegistered", value)}
              />
            </>
          )}
          <ChoiceGroup
            name="independentHousehold"
            label="부모님과 주민등록상 세대가 분리되어 있나요?"
            value={values.independentHousehold}
            options={TRI_STATE_LABELS}
            onChange={(value) => set("independentHousehold", value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>이미 받고 있는 정책</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {policies.map((policy) => (
            <Label
              key={policy.id}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 font-normal has-data-checked:border-primary has-data-checked:bg-secondary"
            >
              <Checkbox
                checked={values.receivingPolicyIds.includes(policy.id)}
                onCheckedChange={(checked) =>
                  set(
                    "receivingPolicyIds",
                    checked === true
                      ? [...values.receivingPolicyIds, policy.id]
                      : values.receivingPolicyIds.filter((id) => id !== policy.id),
                  )
                }
              />
              {policy.name}
            </Label>
          ))}
        </CardContent>
      </Card>

      {Object.keys(errors).length > 0 && (
        <p role="alert" className="text-sm font-medium text-destructive">
          입력하지 않은 항목이 있어요. 표시된 칸을 확인해 주세요.
        </p>
      )}
      <Button type="submit" size="lg" className="h-12 w-full text-base">
        자격 계산하고 진단 시작하기
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        입력한 정보는 저장하지 않으며, 이 브라우저 탭을 닫으면 사라집니다.
      </p>
    </form>
  );
}

export function ProfileForm() {
  const { ready, value } = useSessionValue(SESSION_KEYS.profile, profileSchema);
  if (!ready) return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />;
  return <FormFields initial={value ? toFormValues(value) : EMPTY_VALUES} />;
}
