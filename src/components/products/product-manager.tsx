import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/dashboard/primitives";
import { ImageUpload } from "@/components/forms/image-upload";
import { TextAreaField, TextField } from "@/components/forms/wizard";
import { StorageImage } from "@/components/media/storage-image";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { peso } from "@/lib/marketplace";
import {
  EMPTY_PRODUCT,
  archiveProduct,
  createProduct,
  manageProductsQuery,
  setProductAvailability,
  toDraft,
  updateProduct,
  validateProduct,
  type ManagedProduct,
  type ProductDraft,
} from "@/lib/products";
import { BUCKETS } from "@/lib/storage";

/** Product CRUD for a single seller store. */
export function ProductManager({ storeId, userId }: { storeId: string; userId: string }) {
  const queryClient = useQueryClient();
  const products = useQuery(manageProductsQuery(storeId));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["manage-products", storeId] });
    void queryClient.invalidateQueries({ queryKey: ["store-products", storeId] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error("Nothing to save.");
      const problem = validateProduct(draft);
      if (problem) throw new Error(problem);
      if (editingId) await updateProduct(editingId, storeId, draft);
      else await createProduct(storeId, draft);
    },
    onSuccess: () => {
      toast.success(editingId ? "Product updated" : "Product added");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: (error: Error) =>
      toast.error("Could not save product", { description: error.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => archiveProduct(id),
    onSuccess: () => {
      toast.success("Product removed");
      refresh();
    },
    onError: (error: Error) =>
      toast.error("Could not remove product", { description: error.message }),
  });

  const availability = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => setProductAvailability(id, next),
    onSuccess: refresh,
    onError: (error: Error) =>
      toast.error("Could not update product", { description: error.message }),
  });

  function startCreate() {
    setEditingId(null);
    setDraft({ ...EMPTY_PRODUCT });
  }

  function startEdit(product: ManagedProduct) {
    setEditingId(product.id);
    setDraft(toDraft(product));
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Menu & products"
        description="Everything customers can order from this store"
        action={
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4" /> Add product
          </Button>
        }
      >
        {products.isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading products…</p>
        ) : (products.data ?? []).length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No products yet. Add your first item so customers can order.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(products.data ?? []).map((product) => {
              const image = Array.isArray(product.images) ? (product.images[0] as string) : null;
              return (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3"
                >
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    <StorageImage
                      bucket={BUCKETS.productImages}
                      path={image}
                      alt={product.name}
                      className="size-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {peso(Number(product.price))} · {product.stock} in stock
                      {product.is_published ? "" : " · draft"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={product.is_available}
                      onCheckedChange={(next) => availability.mutate({ id: product.id, next })}
                      aria-label={`${product.name} available`}
                    />
                    <Button variant="ghost" size="sm" onClick={() => startEdit(product)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(product.id)}
                      aria-label={`Remove ${product.name}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {draft ? (
        <Panel title={editingId ? "Edit product" : "New product"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Product name"
              value={draft.name}
              onChange={(v) => setDraft({ ...draft, name: v })}
            />
            <TextField
              label="Price (₱)"
              type="number"
              value={draft.price}
              onChange={(v) => setDraft({ ...draft, price: v })}
            />
            <TextField
              label="Compare-at price (₱)"
              type="number"
              value={draft.compare_at_price}
              onChange={(v) => setDraft({ ...draft, compare_at_price: v })}
              hint="Optional — shows a strikethrough original price."
            />
            <TextField
              label="Stock"
              type="number"
              value={draft.stock}
              onChange={(v) => setDraft({ ...draft, stock: v })}
            />
          </div>
          <div className="mt-4">
            <TextAreaField
              label="Description"
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
              placeholder="Describe the item, portion size or ingredients."
            />
          </div>
          <div className="mt-5 max-w-xs">
            <ImageUpload
              label="Product photo"
              bucket={BUCKETS.productImages}
              userId={userId}
              folder={storeId}
              value={draft.images[0] ?? null}
              onChange={(path) => setDraft({ ...draft, images: path ? [path] : [] })}
            />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Switch
                checked={draft.is_published}
                onCheckedChange={(next) => setDraft({ ...draft, is_published: next })}
              />
              Published
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <Switch
                checked={draft.is_available}
                onCheckedChange={(next) => setDraft({ ...draft, is_available: next })}
              />
              Available today
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {editingId ? "Save changes" : "Add product"}
            </Button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
