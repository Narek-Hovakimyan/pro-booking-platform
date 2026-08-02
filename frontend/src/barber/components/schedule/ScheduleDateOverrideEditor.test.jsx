import { render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import ScheduleDateOverrideEditor from "./ScheduleDateOverrideEditor";
import { parseDateKey } from "@/shared/utils/dates";

const baseProps = {
  dateStatusMap: {
    "2026-08-02": { isDefault: true },
  },
  selectedDateKey: "2026-08-02",
  selectedDateObject: parseDateKey("2026-08-02"),
  todayKey: "2026-08-01",
  isNonWorkingDay: false,
  hasCustomHours: false,
  activeDraft: {
    isWorking: true,
    startTime: "09:00",
    endTime: "18:00",
    breakStart: "",
    breakEnd: "",
  },
  hasUnsavedChanges: false,
  isSaving: false,
  fieldErrors: {},
  isBreakEnabled: false,
  timeInputClass: () => "",
  canMarkDayOff: true,
  onSelectDate: vi.fn(),
  onUpdateDraft: vi.fn(),
  onUpdateTimeDraft: vi.fn(),
  onToggleBreakTime: vi.fn(),
  onSaveSelectedDateSchedule: vi.fn(),
  onResetDraftToDefault: vi.fn(),
  onRemoveOverride: vi.fn(),
  onMarkDayOff: vi.fn(),
};

describe("ScheduleDateOverrideEditor", () => {
  test("derives weekday and day number from the date value", () => {
    const onSelectDate = vi.fn();

    render(
      <ScheduleDateOverrideEditor
        {...baseProps}
        dateOptions={[{ value: "2026-08-02", label: "Misleading label" }]}
        onSelectDate={onSelectDate}
      />
    );

    const dateButton = screen.getByRole("button", { name: "Sun, Aug 2 — Default" });

    expect(within(dateButton).getByText("Sun")).toBeInTheDocument();
    expect(within(dateButton).getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("Mon")).not.toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();

    dateButton.click();

    expect(onSelectDate).toHaveBeenCalledWith("2026-08-02");
  });
});
