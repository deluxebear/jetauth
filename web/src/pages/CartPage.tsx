import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingCart, Trash2, Minus, Plus, ArrowRight, Package } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import * as UserBackend from "../backend/UserBackend";
import * as ProductBackend from "../backend/ProductBackend";
import * as OrderBackend from "../backend/OrderBackend";
import type { ProductInfo } from "../backend/OrderBackend";

import { formatPrice } from "../utils/price";
import { getStoredAccount } from "../utils/auth";

interface CartItemFull extends ProductInfo {
  valid: boolean;
  productImage?: string;
  productDisplayName?: string;
  productPrice?: number;
}

export default function CartPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState<CartItemFull[]>([]);
  const [fullUser, setFullUser] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const account = getStoredAccount();

  // Load cart from user
  useEffect(() => {
    if (!account) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await UserBackend.getUser(account.owner, account.name);
        if (cancelled || res.status !== "ok" || !res.data) { setLoading(false); return; }
        setFullUser(res.data);
        const cart = (res.data.cart as ProductInfo[] | undefined) || [];

        const enriched: CartItemFull[] = await Promise.all(
          cart.map(async (item) => {
            try {
              const pRes = await ProductBackend.getProduct(account.owner, item.name);
              if (pRes.status === "ok" && pRes.data) {
                const p = pRes.data;
                return {
                  ...item,
                  valid: true,
                  productImage: p.image,
                  productDisplayName: p.displayName || p.name,
                  productPrice: item.isRecharge ? (item.price || 0) : p.price,
                  currency: p.currency,
                };
              }
            } catch { /* invalid product */ }
            return { ...item, valid: false };
          })
        );
        if (!cancelled) setCartItems(enriched);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const validItems = cartItems.filter((i) => i.valid);
  const totalPrice = validItems.reduce((sum, i) => sum + (i.productPrice || 0) * i.quantity, 0);
  const currency = validItems[0]?.currency || "USD";

  const saveCart = async (newCart: ProductInfo[]) => {
    if (!fullUser) return;
    const res = await UserBackend.updateUser(account!.owner, account!.name, { ...fullUser, cart: newCart } as any);
    if (res.status === "ok") {
      setFullUser({ ...fullUser, cart: newCart });
    }
  };

  const handleUpdateQuantity = async (index: number, newQty: number) => {
    if (newQty < 1) return;
    const newCart = [...((fullUser?.cart as ProductInfo[]) || [])];
    newCart[index] = { ...newCart[index], quantity: newQty };
    await saveCart(newCart);
    setCartItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: newQty };
      return updated;
    });
  };

  const handleRemoveItem = async (index: number) => {
    const newCart = [...((fullUser?.cart as ProductInfo[]) || [])];
    newCart.splice(index, 1);
    await saveCart(newCart);
    setCartItems((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
    modal.toast(t("common.deleteSuccess" as any), "success");
  };

  const handleClearCart = () => {
    modal.showConfirm(t("cart.confirmClear" as any), async () => {
      await saveCart([]);
      setCartItems([]);
    });
  };

  const handleCheckout = async () => {
    if (validItems.length === 0) return;
    setChecking(true);
    try {
      const productInfos: ProductInfo[] = validItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        ...(item.isRecharge ? { price: item.price } : {}),
        ...(item.pricingName ? { pricingName: item.pricingName } : {}),
        ...(item.planName ? { planName: item.planName } : {}),
      }));

      const res = await OrderBackend.placeOrder(account!.owner, productInfos);
      if (res.status === "ok" && res.data) {
        // Clear cart after successful order
        await saveCart([]);
        setCartItems([]);
        navigate(`/orders/${res.data.owner}/${res.data.name}/pay`);
      } else {
        modal.toast(res.msg || t("cart.checkoutFailed" as any), "error");
      }
    } catch {
      modal.toast(t("cart.checkoutFailed" as any), "error");
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <ShoppingCart size={20} className="text-accent" />
          {t("cart.title" as any)}
          {cartItems.length > 0 && (
            <span className="text-[13px] font-normal text-text-muted">
              ({cartItems.length})
            </span>
          )}
        </h1>
        {cartItems.length > 0 && (
          <button
            onClick={handleClearCart}
            className="text-[12px] text-text-muted hover:text-danger transition-colors"
          >
            {t("cart.clearAll" as any)}
          </button>
        )}
      </div>

      {cartItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-surface-2 p-5 mb-4">
            <Package size={36} className="text-text-muted/40" />
          </div>
          <h3 className="text-[15px] font-semibold text-text-secondary">
            {t("cart.empty" as any)}
          </h3>
          <p className="text-[13px] text-text-muted mt-1 mb-4">
            {t("cart.emptyDesc" as any)}
          </p>
          <Link
            to="/product-store"
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:bg-accent-hover transition-colors"
          >
            {t("cart.goShopping" as any)} <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* Cart Items */}
          <div className="space-y-3">
            {cartItems.map((item, index) => (
              <motion.div
                key={`${item.name}-${index}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-4 rounded-xl border p-4 transition-colors ${
                  item.valid
                    ? "border-border bg-surface-1"
                    : "border-danger/30 bg-danger/5"
                }`}
              >
                {/* Image */}
                <div className="h-20 w-20 shrink-0 rounded-lg bg-surface-2 flex items-center justify-center overflow-hidden">
                  {item.productImage ? (
                    <img src={item.productImage} alt={item.name} className="h-full w-full object-contain p-1" />
                  ) : (
                    <Package size={24} className="text-text-muted/30" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-[14px] font-semibold text-text-primary truncate">
                        {item.productDisplayName || item.displayName || item.name}
                      </h3>
                      {!item.valid && (
                        <span className="text-[11px] text-danger font-medium">
                          {t("cart.invalidProduct" as any)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="shrink-0 rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex items-end justify-between mt-2">
                    <div className="text-[13px] font-mono text-text-secondary">
                      {formatPrice(item.productPrice || 0, item.currency || currency)}
                    </div>

                    {/* Quantity controls */}
                    {item.valid && !item.isRecharge && (
                      <div className="flex items-center border border-border rounded-lg overflow-hidden">
                        <button
                          onClick={() => handleUpdateQuantity(index, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="px-2 py-1 text-text-muted hover:bg-surface-2 disabled:opacity-30 transition-colors"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="px-3 py-1 text-[12px] font-mono border-x border-border bg-surface-1 min-w-[32px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(index, item.quantity + 1)}
                          className="px-2 py-1 text-text-muted hover:bg-surface-2 transition-colors"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}

                    {item.isRecharge && (
                      <span className="text-[11px] text-text-muted italic">
                        {t("store.recharge" as any)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Footer: Total + Checkout */}
          <div className="sticky bottom-0 rounded-xl border border-border bg-surface-1 p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[13px] text-text-muted">{t("cart.total" as any)}: </span>
                <span className="text-xl font-bold text-danger font-mono">
                  {formatPrice(totalPrice, currency)}
                </span>
                <span className="text-[12px] text-text-muted ml-1">
                  ({validItems.length} {t("cart.items" as any)})
                </span>
              </div>
              <button
                onClick={handleCheckout}
                disabled={checking || validItems.length === 0}
                className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {checking ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <ArrowRight size={16} />
                )}
                {t("cart.checkout" as any)}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
