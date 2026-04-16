import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Clock, AlertTriangle, ShoppingBag, FileText } from "lucide-react";
import { useTranslation } from "../i18n";
import * as PaymentBackend from "../backend/PaymentBackend";
import type { Payment } from "../backend/PaymentBackend";

import { formatPrice } from "../utils/price";

export default function PaymentResultPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const { t } = useTranslation();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPayment = useCallback(async () => {
    if (!owner || !name) return;
    const res = await PaymentBackend.getPayment(owner, name);
    if (res.status === "ok" && res.data) {
      setPayment(res.data as Payment);
    }
    setLoading(false);
  }, [owner, name]);

  // Initial load
  useEffect(() => {
    fetchPayment();
  }, [fetchPayment]);

  // Poll when state is "Created"
  useEffect(() => {
    if (!payment || payment.state !== "Created") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        await PaymentBackend.notifyPayment(owner!, name!);
        const res = await PaymentBackend.getPayment(owner!, name!);
        if (res.status === "ok" && res.data) {
          const p = res.data as Payment;
          setPayment(p);
          if (p.state !== "Created" && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch { /* ignore polling errors */ }
    }, 2000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [payment?.state, owner, name]);

  if (loading || !payment) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const state = payment.state;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-lg mx-auto py-12"
    >
      <div className="rounded-xl border border-border bg-surface-1 p-8 text-center space-y-5">
        {/* State Icon */}
        {state === "Paid" && (
          <div className="mx-auto h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-success" />
          </div>
        )}
        {state === "Created" && (
          <div className="mx-auto h-16 w-16 rounded-full bg-accent/15 flex items-center justify-center">
            <div className="h-8 w-8 rounded-full border-3 border-accent/30 border-t-accent animate-spin" />
          </div>
        )}
        {state === "Canceled" && (
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/15 flex items-center justify-center">
            <AlertTriangle size={36} className="text-amber-500" />
          </div>
        )}
        {state === "Timeout" && (
          <div className="mx-auto h-16 w-16 rounded-full bg-surface-3 flex items-center justify-center">
            <Clock size={36} className="text-text-muted" />
          </div>
        )}
        {(state === "Error" || (!["Paid", "Created", "Canceled", "Timeout"].includes(state))) && (
          <div className="mx-auto h-16 w-16 rounded-full bg-danger/15 flex items-center justify-center">
            <XCircle size={36} className="text-danger" />
          </div>
        )}

        {/* Title */}
        <div>
          <h1 className="text-xl font-bold">
            {state === "Paid" && t("payResult.paid" as any)}
            {state === "Created" && t("payResult.processing" as any)}
            {state === "Canceled" && t("payResult.canceled" as any)}
            {state === "Timeout" && t("payResult.timeout" as any)}
            {state === "Error" && t("payResult.error" as any)}
          </h1>
          {state === "Created" && (
            <p className="text-[13px] text-text-muted mt-1">
              {t("payResult.processingDesc" as any)}
            </p>
          )}
          {state === "Error" && payment.message && (
            <p className="text-[13px] text-danger mt-1">{payment.message}</p>
          )}
        </div>

        {/* Payment details */}
        <div className="rounded-lg bg-surface-2 p-4 space-y-2 text-[13px]">
          <div className="flex justify-between">
            <span className="text-text-muted">{t("payResult.amount" as any)}</span>
            <span className="font-mono font-bold text-text-primary">
              {formatPrice(payment.price, payment.currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">{t("payResult.paymentId" as any)}</span>
            <span className="font-mono text-text-secondary">{payment.name}</span>
          </div>
          {payment.provider && (
            <div className="flex justify-between">
              <span className="text-text-muted">{t("payResult.provider" as any)}</span>
              <span className="text-text-secondary">{payment.provider}</span>
            </div>
          )}
          {payment.productsDisplayName && (
            <div className="flex justify-between">
              <span className="text-text-muted">{t("payResult.products" as any)}</span>
              <span className="text-text-secondary truncate max-w-[200px]" title={payment.productsDisplayName}>
                {payment.productsDisplayName}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 justify-center pt-2">
          {payment.order && (
            <Link
              to={`/orders/${owner}/${payment.order}/pay`}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-[13px] font-medium text-text-secondary hover:bg-surface-2 transition-colors"
            >
              <FileText size={14} />
              {t("payResult.viewOrder" as any)}
            </Link>
          )}
          <Link
            to="/product-store"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            <ShoppingBag size={14} />
            {t("payResult.backToStore" as any)}
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
