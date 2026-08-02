import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Favourite store ids for the signed-in customer. */
export function favoriteStoresQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["favorite-stores", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("favorites")
        .select("store_id")
        .eq("user_id", userId!)
        .not("store_id", "is", null);
      if (error) throw error;
      return (data ?? []).map((row) => row.store_id as string);
    },
  });
}

export async function toggleFavoriteStore(userId: string, storeId: string, isFavorite: boolean) {
  if (isFavorite) {
    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", userId)
      .eq("store_id", storeId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("favorites").insert({ user_id: userId, store_id: storeId });
  if (error) throw error;
}
