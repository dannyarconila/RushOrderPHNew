import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

export interface CartLine {
  productId: string;
  storeId: string;
  storeName: string;
  name: string;
  price: number;
  image: string | null;
  quantity: number;
  stock: number;
}

interface CartContextValue {
  lines: CartLine[];
  storeId: string | null;
  storeName: string | null;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);
const STORAGE_KEY = "rushorder.cart.v1";

function readStored(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as CartLine[]) : [];
  } catch {
    return [];
  }
}

/** Single-store cart persisted to localStorage so guests can shop before signing in. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  // Hydrate after mount so SSR markup matches the client render.
  useEffect(() => setLines(readStored()), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines]);

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((prev) => {
      const differentStore = prev.length > 0 && prev[0].storeId !== line.storeId;
      const base = differentStore ? [] : prev;
      if (differentStore) {
        toast.info("Cart cleared", { description: "You can only order from one store at a time." });
      }
      const existing = base.find((l) => l.productId === line.productId);
      if (existing) {
        const next = Math.min(existing.quantity + quantity, Math.max(line.stock, 1));
        return base.map((l) =>
          l.productId === line.productId ? { ...l, ...line, quantity: next } : l,
        );
      }
      return [...base, { ...line, quantity: Math.max(1, quantity) }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );
  }, []);

  const remove = useCallback(
    (productId: string) => setLines((prev) => prev.filter((l) => l.productId !== productId)),
    [],
  );

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      storeId: lines[0]?.storeId ?? null,
      storeName: lines[0]?.storeName ?? null,
      count: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotal: lines.reduce((sum, l) => sum + l.quantity * l.price, 0),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [lines, add, setQuantity, remove, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
