import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, X, Package, ShoppingBag, Tag, RefreshCw } from "lucide-react";
import { useTranslation } from "../i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "../OrganizationContext";
import * as ProductBackend from "../backend/ProductBackend";
import type { Product } from "../backend/ProductBackend";

import { formatPrice } from "../utils/price";

function ProductCard({ product, t }: { product: Product; t: (key: string) => string }) {
  const isOutOfStock = product.quantity <= 0;

  return (
    <Link
      to={`/products/${product.owner}/${encodeURIComponent(product.name)}/buy`}
      className="group block"
    >
      <div className="rounded-xl border border-border bg-surface-1 overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-accent/30 hover:-translate-y-0.5">
        {/* Image */}
        <div className="relative h-48 bg-surface-2 flex items-center justify-center overflow-hidden">
          {product.image ? (
            <img
              src={product.image}
              alt={product.displayName || product.name}
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <Package size={48} className="text-text-muted/30" />
          )}
          {/* State badge */}
          {isOutOfStock && (
            <div className="absolute top-2 right-2 rounded-full bg-danger/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              {t("store.outOfStock" as any)}
            </div>
          )}
          {product.isRecharge && (
            <div className="absolute top-2 left-2 rounded-full bg-accent/90 px-2 py-0.5 text-[10px] font-semibold text-white">
              {t("store.recharge" as any)}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4 space-y-2.5">
          {/* Name */}
          <h3 className="text-[14px] font-semibold text-text-primary line-clamp-1 group-hover:text-accent transition-colors">
            {product.displayName || product.name}
          </h3>

          {/* Description */}
          {product.description && (
            <p className="text-[12px] text-text-muted line-clamp-2 leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Tag */}
          {product.tag && (
            <div className="flex items-center gap-1">
              <Tag size={11} className="text-accent/60" />
              <span className="text-[11px] text-accent/80 font-medium">
                {product.tag}
              </span>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-border-subtle" />

          {/* Price & Stats */}
          <div className="flex items-end justify-between">
            <div>
              {product.isRecharge ? (
                <div className="space-y-0.5">
                  {(product.rechargeOptions || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(product.rechargeOptions || []).slice(0, 3).map((opt) => (
                        <span
                          key={opt}
                          className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-mono font-medium text-accent"
                        >
                          {formatPrice(opt, product.currency)}
                        </span>
                      ))}
                      {(product.rechargeOptions || []).length > 3 && (
                        <span className="text-[11px] text-text-muted">
                          +{(product.rechargeOptions || []).length - 3}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[12px] text-text-muted italic">
                      {product.currency}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[20px] font-bold text-danger tracking-tight">
                  {formatPrice(product.price, product.currency)}
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-[11px] text-text-muted">
                {(t("store.soldCount" as any) as string).replace(
                  "{count}",
                  String(product.sold || 0)
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden animate-pulse">
      <div className="h-48 bg-surface-3" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-3/4 bg-surface-3 rounded" />
        <div className="h-3 w-full bg-surface-3 rounded" />
        <div className="border-t border-border-subtle" />
        <div className="h-6 w-1/3 bg-surface-3 rounded" />
      </div>
    </div>
  );
}

export default function ProductStorePage() {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const { getRequestOwner } = useOrganization();
  const queryClient = useQueryClient();

  // Fetch only published products server-side
  const { data: res, isLoading } = useQuery({
    queryKey: ["product-store", getRequestOwner()],
    queryFn: () => ProductBackend.getProducts({
      owner: getRequestOwner(),
      p: 1,
      pageSize: 100,
      field: "state",
      value: "Published",
    }),
  });

  const allProducts = res?.status === "ok" && Array.isArray(res.data) ? res.data : [];

  // Client-side search
  const filteredProducts = useMemo(() => {
    let products = allProducts;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.displayName || "").toLowerCase().includes(q) ||
          (p.description || "").toLowerCase().includes(q) ||
          (p.tag || "").toLowerCase().includes(q)
      );
    }
    return products;
  }, [allProducts, searchQuery]);

  // Collect unique tags for filter
  const tags = useMemo(() => {
    const tagSet = new Set<string>();
    allProducts.forEach((p) => {
        if (p.tag) tagSet.add(p.tag);
      });
    return Array.from(tagSet).sort();
  }, [allProducts]);

  const [selectedTag, setSelectedTag] = useState<string>("");

  const displayProducts = useMemo(() => {
    if (!selectedTag) return filteredProducts;
    return filteredProducts.filter((p) => p.tag === selectedTag);
  }, [filteredProducts, selectedTag]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingBag size={20} className="text-accent" />
            {t("store.title" as any)}
          </h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            {t("store.subtitle" as any)}
          </p>
        </div>
        <motion.button
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
          onClick={() => queryClient.invalidateQueries({ queryKey: ["product-store"] })}
          className="rounded-lg border border-border p-2 text-text-muted hover:bg-surface-2 transition-colors shrink-0"
          title={t("common.refresh")}
        >
          <RefreshCw size={15} />
        </motion.button>
      </div>

      {/* Search + Tag Filter */}
      <div className="space-y-3">
        {/* Search bar */}
        <div className="relative max-w-md">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("store.search" as any)}
            className="w-full rounded-lg border border-border bg-surface-1 pl-9 pr-8 py-2 text-[13px] placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Tag pills */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedTag("")}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                !selectedTag
                  ? "bg-accent text-white"
                  : "bg-surface-2 text-text-secondary hover:bg-surface-3"
              }`}
            >
              {t("store.allCategories" as any)}
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? "" : tag)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  selectedTag === tag
                    ? "bg-accent text-white"
                    : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : displayProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-surface-2 p-5 mb-4">
            <Package size={36} className="text-text-muted/40" />
          </div>
          <h3 className="text-[15px] font-semibold text-text-secondary">
            {t("store.noProducts" as any)}
          </h3>
          <p className="text-[13px] text-text-muted mt-1">
            {t("store.noProductsDesc" as any)}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayProducts.map((product) => (
            <ProductCard key={`${product.owner}/${product.name}`} product={product} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
