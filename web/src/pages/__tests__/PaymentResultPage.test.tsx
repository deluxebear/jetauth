import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../../i18n", () => ({
  useTranslation: () => ({ t: (k: string) => k, locale: "en", setLocale: vi.fn(), locales: [] }),
}));

const getPayment = vi.fn();
const notifyPayment = vi.fn();
vi.mock("../../backend/PaymentBackend", () => ({
  getPayment: (...a: unknown[]) => getPayment(...a),
  notifyPayment: (...a: unknown[]) => notifyPayment(...a),
}));

import PaymentResultPage from "../PaymentResultPage";

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

describe("PaymentResultPage polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getPayment.mockReset();
    notifyPayment.mockReset().mockResolvedValue({ status: "ok" });
  });
  afterEach(() => vi.useRealTimers());

  it("polls while Created and stops once the state changes", async () => {
    getPayment
      .mockResolvedValueOnce({ status: "ok", data: { owner: "o", name: "p", state: "Created", price: 1, currency: "USD" } })
      .mockResolvedValue({ status: "ok", data: { owner: "o", name: "p", state: "Paid", price: 1, currency: "USD" } });

    render(
      <MemoryRouter initialEntries={["/payments/o/p/result"]}>
        <Routes><Route path="/payments/:owner/:name/result" element={<PaymentResultPage />} /></Routes>
      </MemoryRouter>,
    );
    await flush();
    expect(getPayment).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(notifyPayment).toHaveBeenCalledTimes(1);
    expect(getPayment).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(notifyPayment).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("common.noData")).toBeNull();
  });
});
