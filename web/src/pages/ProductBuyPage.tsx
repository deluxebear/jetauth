import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ShoppingCart, Zap, Minus, Plus, Tag } from "lucide-react";
import { useTranslation } from "../i18n";
import { useModal } from "../components/Modal";
import { useEntityEdit } from "../hooks/useEntityEdit";
import * as ProductBackend from "../backend/ProductBackend";
import * as OrderBackend from "../backend/OrderBackend";
import * as UserBackend from "../backend/UserBackend";
import type { Product } from "../backend/ProductBackend";
import type { ProductInfo } from "../backend/OrderBackend";

import { formatPrice, CURRENCY_SYMBOLS } from "../utils/price";
import { getStoredAccount } from "../utils/auth";

export default function ProductBuyPage() {
  const { owner, name } = useParams<{ owner: string; name: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const modal = useModal();
  const account = getStoredAccount();

  const { entity: product, loading } = useEntityEdit<Product>({
    queryKey: "product-buy",
    owner,
    name,
    fetchFn: ProductBackend.getProduct,
  });

  const [quantity, setQuantity] = useState(1);
  const [selectedRechargeAmount, setSelectedRechargeAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [buying, setBuying] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  // Set default recharge amount
  useEffect(() => {
    if (product?.isRecharge && product.rechargeOptions?.length) {
      setSelectedRechargeAmount(product.rechargeOptions[0]);
    }
  }, [product]);

  if (loading || !product) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
      </div>
    );
  }

  const rechargeAmount = selectedRechargeAmount ?? (customAmount ? parseFloat(customAmount) : 0);
  const unitPrice = product.isRecharge ? rechargeAmount : product.price;
  const totalPrice = unitPrice * (product.isRecharge ? 1 : quantity);

  const buildProductInfo = (): ProductInfo => ({
    name: product.name,
    quantity: product.isRecharge ? 1 : quantity,
    ...(product.isRecharge ? { price: rechargeAmount } : {}),
  });

  const handleBuyNow = async () => {
    if (product.isRecharge && rechargeAmount <= 0) {
      modal.toast(t("buy.invalidAmount" as any), "error");
      return;
    }
    setBuying(true);
    try {
      const res = await OrderBackend.placeOrder(product.owner, [buildProductInfo()]);
      if (res.status === "ok" && res.data) {
        const order = res.data;
        navigate(`/orders/${order.owner}/${order.name}/pay`);
      } else {
        modal.toast(res.msg || t("buy.orderFailed" as any), "error");
      }
    } catch {
      modal.toast(t("buy.orderFailed" as any), "error");
    } finally {
      setBuying(false);
    }
  };

  const handleAddToCart = async () => {
    if (!account) return;
    if (product.isRecharge) {
      modal.toast(t("buy.rechargeNoCart" as any), "error");
      return;
    }
    setAddingToCart(true);
    try {
      const userRes = await UserBackend.getUser(account.owner, account.name);
      if (userRes.status !== "ok" || !userRes.data) return;
      const fullUser = userRes.data;
      const cart = (fullUser.cart as ProductInfo[] | undefined) || [];

      // Currency consistency check
      if (cart.length > 0) {
        const cartCurrency = cart[0].currency || product.currency;
        if (cartCurrency !== product.currency) {
          modal.toast(t("buy.currencyMismatch" as any), "error");
          setAddingToCart(false);
          return;
        }
      }

      // Merge or add
      const existing = cart.find((item) => item.name === product.name);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({
          name: product.name,
          displayName: product.displayName,
          image: product.image,
          price: product.price,
          currency: product.currency,
          quantity,
        });
      }

      const updateRes = await UserBackend.updateUser(account.owner, account.name, { ...fullUser, cart } as any);
      if (updateRes.status === "ok") {
        modal.toast(t("buy.addedToCart" as any), "success");
      } else {
        modal.toast(updateRes.msg || t("buy.cartFailed" as any), "error");
      }
    } catch {
      modal.toast(t("buy.cartFailed" as any), "error");
    } finally {
      setAddingToCart(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text-primary transition-colors"
      >
        <ArrowLeft size={16} /> {t("buy.backToStore" as any)}
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Product Image */}
        <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
          <div className="aspect-square bg-surface-2 flex items-center justify-center p-8">
            {product.image ? (
              <img src={product.image} alt={product.displayName || product.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-text-muted/30 text-6xl">📦</div>
            )}
          </div>
        </div>

        {/* Right: Product Details */}
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {product.displayName || product.name}
            </h1>
            {product.tag && (
              <div className="flex items-center gap-1 mt-2">
                <Tag size={13} className="text-accent/60" />
                <span className="text-[12px] text-accent font-medium">{product.tag}</span>
              </div>
            )}
          </div>

          {product.description && (
            <p className="text-[14px] text-text-secondary leading-relaxed">
              {product.description}
            </p>
          )}

          {product.detail && (
            <p className="text-[13px] text-text-muted leading-relaxed">
              {product.detail}
            </p>
          )}

          {/* Price / Recharge Options */}
          <div className="border-t border-border-subtle pt-4">
            {product.isRecharge ? (
              <div className="space-y-3">
                <label className="text-[13px] font-medium text-text-secondary">
                  {t("buy.selectAmount" as any)}
                </label>
                {(product.rechargeOptions || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {product.rechargeOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { setSelectedRechargeAmount(opt); setCustomAmount(""); }}
                        className={`rounded-lg border px-4 py-2 text-[13px] font-mono font-semibold transition-colors ${
                          selectedRechargeAmount === opt
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-surface-1 text-text-secondary hover:border-accent/50"
                        }`}
                      >
                        {formatPrice(opt, product.currency)}
                      </button>
                    ))}
                  </div>
                )}
                {!product.disableCustomRecharge && (
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-text-muted">{CURRENCY_SYMBOLS[product.currency] || product.currency}</span>
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => { setCustomAmount(e.target.value); setSelectedRechargeAmount(null); }}
                      placeholder={t("buy.customAmount" as any)}
                      className="flex-1 rounded-lg border border-border bg-surface-1 px-3 py-2 text-[13px] font-mono focus:border-accent focus:ring-1 focus:ring-accent/30 outline-none transition-colors"
                      min="0"
                      step="any"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-danger tracking-tight">
                  {formatPrice(product.price, product.currency)}
                </span>
                <span className="text-[12px] text-text-muted">
                  {t("buy.soldCount" as any).replace("{count}", String(product.sold || 0))}
                </span>
              </div>
            )}
          </div>

          {/* Quantity Selector (non-recharge only) */}
          {!product.isRecharge && (
            <div className="flex items-center gap-3">
              <label className="text-[13px] font-medium text-text-secondary">
                {t("buy.quantity" as any)}
              </label>
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-3 py-1.5 text-text-muted hover:bg-surface-2 transition-colors"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 text-center text-[13px] font-mono border-x border-border bg-surface-1 py-1.5 outline-none"
                  min="1"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="px-3 py-1.5 text-text-muted hover:bg-surface-2 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
              {quantity > 1 && (
                <span className="text-[12px] text-text-muted">
                  {t("buy.subtotal" as any)}: {formatPrice(totalPrice, product.currency)}
                </span>
              )}
            </div>
          )}

          {/* Stock info */}
          {!product.isRecharge && (
            <div className="text-[12px] text-text-muted">
              {product.quantity > 0
                ? `${t("buy.inStock" as any)}: ${product.quantity}`
                : t("buy.outOfStock" as any)}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleBuyNow}
              disabled={buying || (!product.isRecharge && product.quantity <= 0)}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-[14px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {buying ? (
                <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              {t("buy.buyNow" as any)}
            </button>
            {!product.isRecharge && (
              <button
                onClick={handleAddToCart}
                disabled={addingToCart || product.quantity <= 0}
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-6 py-3 text-[14px] font-medium text-text-secondary hover:bg-surface-2 disabled:opacity-50 transition-colors"
              >
                {addingToCart ? (
                  <div className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                ) : (
                  <ShoppingCart size={16} />
                )}
                {t("buy.addToCart" as any)}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
