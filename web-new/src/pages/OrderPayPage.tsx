import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, CreditCard, Wallet, Package, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as OrderBackend from "../backend/OrderBackend";
import * as ProductBackend from "../backend/ProductBackend";
import type { Order } from "../backend/OrderBackend";
import type { Product } from "../backend/ProductBackend";
import { useQuery } from "@tanstack/react-query";

import { formatPrice } from "../utils/price";

/** Detect WeChat browser environment */
function getPaymentEnv(): string {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("micromessenger") && ua.includes("mobile")) return "WechatBrowser";
  return "";
}

const ORDER_STATE_STYLES: Record<string, { icon: typeof CheckCircle2; cls: string }> = {
  Paid: { icon: CheckCircle2, cls: "text-success bg-success/15" },
  Created: { icon: Clock, cls: "text-amber-600 bg-amber-500/15" },
  Canceled: { icon: XCircle, cls: "text-text-muted bg-surface-3" },
  Failed: { icon: XCircle, cls: "text-danger bg-danger/15" },
  Timeout: { icon: Clock, cls: "text-text-muted bg-surface-3" },
};

export default function OrderPayPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [paying, setPaying] = useState(false);

  const { entity: order, loading } = useEntityEdit<Order>({
    queryKey: "order-pay",
    owner,
    name,
    fetchFn: OrderBackend.getOrder,
  });

  // Fetch first product to get provider list
  const firstProductName = order?.products?.[0];
  const { data: productRes } = useQuery({
    queryKey: ["order-product", owner, firstProductName],
    queryFn: () => ProductBackend.getProduct(owner!, firstProductName!),
    enabled: !!owner && !!firstProductName,
  });
  const firstProduct = productRes?.status === "ok" ? productRes.data as Product & { providerObjs?: Array<{ owner: string; name: string; displayName: string; category: string; type: string }> } : null;
  const providers = (firstProduct?.providerObjs || []).filter((p) => p.category === "Payment");

  if (loading || !order) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const isPayable = order.state === "Created";
  const stateStyle = ORDER_STATE_STYLES[order.state] || ORDER_STATE_STYLES.Created;
  const StateIcon = stateStyle.icon;

  const handlePay = async () => {
    if (!selectedProvider) {
      modal.toast(t("orderPay.selectProvider" as any), "error");
      return;
    }
    setPaying(true);
    try {
      const paymentEnv = getPaymentEnv();
      const res = await OrderBackend.payOrder(owner!, name!, selectedProvider, paymentEnv);
      if (res.status === "ok") {
        const payment = (res as any).data;
        const payUrl = payment?.payUrl;

        if (payment?.state === "Paid") {
          // Balance payment — immediate success
          navigate(`/payments/${payment.owner}/${payment.name}/result`);
        } else if (payUrl) {
          // External payment — redirect
          window.location.href = payUrl;
        } else {
          // Fallback to result page
          navigate(`/payments/${payment.owner}/${payment.name}/result`);
        }
      } else {
        modal.toast(res.msg || t("orderPay.payFailed" as any), "error");
      }
    } catch {
      modal.toast(t("orderPay.payFailed" as any), "error");
    } finally {
      setPaying(false);
    }
  };

  const handleCancel = () => {
    modal.showConfirm(t("orderPay.confirmCancel" as any), async () => {
      const res = await OrderBackend.cancelOrder(owner!, name!);
      if (res.status === "ok") {
        modal.toast(t("orderPay.cancelSuccess" as any), "success");
        navigate("/orders");
      } else {
        modal.toast(res.msg || t("orderPay.cancelFailed" as any), "error");
      }
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigate("/orders")} className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary transition-colors">
        <ArrowLeft size={16} /> {t("orderPay.backToOrders" as any)}
      </button>

      {/* Order Info */}
      <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("orderPay.orderInfo" as any)}</h2>
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${stateStyle.cls}`}>
            <StateIcon size={13} />
            {order.state}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <span className="text-text-muted">{t("orderPay.orderId" as any)}</span>
            <p className="font-mono text-text-primary">{order.name}</p>
          </div>
          <div>
            <span className="text-text-muted">{t("orderPay.createdTime" as any)}</span>
            <p className="font-mono text-text-primary">{order.createdTime ? new Date(order.createdTime).toLocaleString() : "—"}</p>
          </div>
        </div>

        {/* Product list */}
        <div className="border-t border-border-subtle pt-3 space-y-2">
          {(order.productInfos || []).map((item, idx) => (
            <div key={idx} className="flex items-center justify-between text-[13px]">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-text-muted" />
                <span className="text-text-primary">{item.displayName || item.name}</span>
                <span className="text-text-muted">x{item.quantity}</span>
              </div>
              <span className="font-mono font-medium">
                {formatPrice(item.price * item.quantity, order.currency)}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="border-t border-border-subtle pt-3 flex items-center justify-between">
          <span className="text-[14px] font-medium">{t("orderPay.total" as any)}</span>
          <span className="text-2xl font-bold text-danger font-mono">
            {formatPrice(order.price, order.currency)}
          </span>
        </div>
      </div>

      {/* Payment Methods (only when payable) */}
      {isPayable && (
        <div className="rounded-xl border border-border bg-surface-1 p-5 space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CreditCard size={18} className="text-accent" />
            {t("orderPay.paymentMethod" as any)}
          </h2>

          {providers.length === 0 ? (
            <p className="text-[13px] text-text-muted py-4 text-center">
              {t("orderPay.noProviders" as any)}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {providers.map((p) => (
                <button
                  key={p.name}
                  onClick={() => setSelectedProvider(p.name)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${
                    selectedProvider === p.name
                      ? "border-accent bg-accent/5 ring-1 ring-accent/30"
                      : "border-border hover:border-accent/50 hover:bg-surface-2"
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                    {p.type === "Balance" ? (
                      <Wallet size={16} className="text-accent" />
                    ) : (
                      <CreditCard size={16} className="text-text-muted" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-text-primary truncate">
                      {p.displayName || p.name}
                    </div>
                    <div className="text-[11px] text-text-muted">{p.type}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pay + Cancel buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handlePay}
              disabled={paying || !selectedProvider}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {paying ? (
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <CreditCard size={16} />
              )}
              {t("orderPay.confirmPay" as any)} {formatPrice(order.price, order.currency)}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg border border-border px-4 py-3 text-[13px] font-medium text-text-muted hover:text-danger hover:border-danger/30 transition-colors"
            >
              {t("orderPay.cancel" as any)}
            </button>
          </div>
        </div>
      )}

      {/* Non-payable state info */}
      {!isPayable && (
        <div className="rounded-xl border border-border bg-surface-1 p-5 text-center space-y-3">
          <StateIcon size={32} className={`mx-auto ${stateStyle.cls.split(" ")[0]}`} />
          <p className="text-[14px] text-text-secondary">
            {order.state === "Paid" ? t("orderPay.alreadyPaid" as any) : t("orderPay.cannotPay" as any)}
          </p>
          {order.payment && (
            <Link
              to={`/payments/${owner}/${order.payment}/result`}
              className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
            >
              {t("orderPay.viewPayment" as any)}
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}
