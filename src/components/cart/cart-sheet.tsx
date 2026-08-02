import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";

import { StorageImage } from "@/components/media/storage-image";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCart } from "@/contexts/cart-context";
import { peso } from "@/lib/marketplace";
import { BUCKETS } from "@/lib/storage";

/** Header cart button plus the slide-over basket. */
export function CartSheet() {
  const [open, setOpen] = useState(false);
  const { lines, count, subtotal, setQuantity, remove, storeName } = useCart();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
          className="relative inline-flex size-10 items-center justify-center rounded-xl border border-border text-foreground hover:bg-secondary"
        >
          <ShoppingCart className="size-5" />
          {count > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
              {count}
            </span>
          ) : null}
        </button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription>
            {storeName ? `Ordering from ${storeName}` : "Add items from a store to get started."}
          </SheetDescription>
        </SheetHeader>

        <div className="-mx-1 flex-1 overflow-y-auto px-1 py-4">
          {lines.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Your cart is empty.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lines.map((line) => (
                <li key={line.productId} className="flex gap-3 rounded-xl border border-border p-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-secondary">
                    <StorageImage
                      bucket={BUCKETS.productImages}
                      path={line.image}
                      alt={line.name}
                      className="size-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{line.name}</p>
                    <p className="text-xs text-muted-foreground">{peso(line.price)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity - 1)}
                        className="inline-flex size-7 items-center justify-center rounded-lg border border-border hover:bg-secondary"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">{line.quantity}</span>
                      <button
                        type="button"
                        aria-label={`Increase ${line.name}`}
                        onClick={() => setQuantity(line.productId, line.quantity + 1)}
                        className="inline-flex size-7 items-center justify-center rounded-lg border border-border hover:bg-secondary"
                      >
                        <Plus className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${line.name}`}
                        onClick={() => remove(line.productId)}
                        className="ml-auto inline-flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-bold">{peso(line.price * line.quantity)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-bold">{peso(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Delivery fee is calculated at checkout.
          </p>
          <Button asChild block className="mt-4" disabled={lines.length === 0}>
            <Link to="/checkout" onClick={() => setOpen(false)}>
              Go to checkout
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
