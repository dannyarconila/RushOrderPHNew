import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductRow = Database["public"]["Tables"]["products"]["Row"];

export const PRODUCT_FIELDS =
  "id,store_id,category_id,name,description,price,compare_at_price,stock,images,is_published,is_available,created_at";

export type ManagedProduct = Pick<
  ProductRow,
  | "id"
  | "store_id"
  | "category_id"
  | "name"
  | "description"
  | "price"
  | "compare_at_price"
  | "stock"
  | "images"
  | "is_published"
  | "is_available"
  | "created_at"
>;

/** Every product of a seller store, including unpublished drafts. */
export function manageProductsQuery(storeId: string | undefined) {
  return queryOptions({
    queryKey: ["manage-products", storeId ?? null],
    enabled: Boolean(storeId),
    queryFn: async (): Promise<ManagedProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_FIELDS)
        .eq("store_id", storeId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as ManagedProduct[];
    },
  });
}

export interface ProductDraft {
  name: string;
  description: string;
  price: string;
  compare_at_price: string;
  stock: string;
  category_id: string | null;
  images: string[];
  is_published: boolean;
  is_available: boolean;
}

export const EMPTY_PRODUCT: ProductDraft = {
  name: "",
  description: "",
  price: "",
  compare_at_price: "",
  stock: "0",
  category_id: null,
  images: [],
  is_published: true,
  is_available: true,
};

export function toDraft(product: ManagedProduct): ProductDraft {
  return {
    name: product.name,
    description: product.description ?? "",
    price: String(product.price ?? ""),
    compare_at_price: product.compare_at_price != null ? String(product.compare_at_price) : "",
    stock: String(product.stock ?? 0),
    category_id: product.category_id,
    images: Array.isArray(product.images) ? (product.images as string[]) : [],
    is_published: product.is_published,
    is_available: product.is_available,
  };
}

function payload(storeId: string, draft: ProductDraft) {
  const number = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const optional = (value: string) => {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    store_id: storeId,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    price: number(draft.price, 0),
    compare_at_price: optional(draft.compare_at_price),
    stock: Math.max(0, Math.round(number(draft.stock, 0))),
    category_id: draft.category_id,
    images: draft.images as unknown as never,
    is_published: draft.is_published,
    is_available: draft.is_available,
  };
}

export function validateProduct(draft: ProductDraft): string | null {
  if (draft.name.trim().length < 2) return "Product name must be at least 2 characters.";
  if (draft.name.trim().length > 120) return "Product name must be under 120 characters.";
  if (draft.description.length > 1000) return "Description must be under 1000 characters.";
  const price = Number(draft.price);
  if (!Number.isFinite(price) || price <= 0) return "Enter a price greater than zero.";
  if (price > 1_000_000) return "Price looks too high.";
  const stock = Number(draft.stock);
  if (!Number.isFinite(stock) || stock < 0) return "Stock cannot be negative.";
  return null;
}

export async function createProduct(storeId: string, draft: ProductDraft) {
  const { error } = await supabase.from("products").insert(payload(storeId, draft));
  if (error) throw error;
}

export async function updateProduct(id: string, storeId: string, draft: ProductDraft) {
  const { error } = await supabase.from("products").update(payload(storeId, draft)).eq("id", id);
  if (error) throw error;
}

/** Soft delete so order history keeps referencing the product row. */
export async function archiveProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString(), is_published: false, is_available: false })
    .eq("id", id);
  if (error) throw error;
}

export async function setProductAvailability(id: string, isAvailable: boolean) {
  const { error } = await supabase
    .from("products")
    .update({ is_available: isAvailable })
    .eq("id", id);
  if (error) throw error;
}
