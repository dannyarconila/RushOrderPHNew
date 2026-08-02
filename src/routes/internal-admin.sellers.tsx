import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { MemberDirectory } from "@/components/admin/member-directory";
import {
  ActionDialog,
  DetailGrid,
  Pill,
  Section,
  Td,
  peso,
  statusTone,
} from "@/components/admin/primitives";
import { PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { setAccountStatus } from "@/lib/admin/mutations";
import { storesByOwnerQuery, walletsQuery } from "@/lib/admin/queries";
export const Route = createFileRoute("/internal-admin/sellers")({
  component: SellersPage,
});

function SellersPage() {
  const queryClient = useQueryClient();
  const { data: stores } = useQuery(storesByOwnerQuery());
  const { data: wallets } = useQuery(walletsQuery());
  const [pending, setPending] = useState<{
    userId: string;
    name: string;
    banned: boolean;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: setAccountStatus,
    onSuccess: () => {
      toast.success("Seller account updated successfully.");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      setPending(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const storesFor = (ownerId: string) => (stores ?? []).filter((s) => s.owner_id === ownerId);
  const walletFor = (ownerId: string) =>
    (wallets ?? []).find((w) => w.user_id === ownerId && w.wallet_type === "seller");

  return (
    <>
      <PageHeader
        title="Sellers"
        description="Approved selling partners, their storefronts, wallets and order activity."
      />

      <MemberDirectory
        role="seller"
        emptyTitle="No sellers yet"
        emptyDescription="Approved selling partners will appear here once applications are accepted."
        extraHead={["Store", "Wallet"]}
        renderExtra={(member) => {
          const owned = storesFor(member.id);
          const wallet = walletFor(member.id);
          return (
            <>
              <Td>
                {owned.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No store</span>
                ) : (
                  owned.map((store) => (
                    <div key={store.id} className="mb-1 last:mb-0">
                      <p className="text-sm font-semibold">{store.name}</p>
                      <Pill tone={statusTone(store.verification_status)}>
                        {store.verification_status}
                      </Pill>
                    </div>
                  ))
                )}
              </Td>
              <Td className="text-sm">{wallet ? peso(wallet.balance) : "—"}</Td>
            </>
          );
        }}
        rowActions={(member) => {
          const store = storesFor(member.id)[0];
          if (!store) return null;

          return (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/store/$storeId" params={{ storeId: store.id }}>
                  Store
                </Link>
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setPending({
                    userId: member.id,
                    name: store.name,
                    banned: true,
                  })
                }
              >
                Ban Account
              </Button>
            </>
          );
        }}
        renderDetails={(member) => {
          const owned = storesFor(member.id);
          const wallet = walletFor(member.id);
          return (
            <>
              <Section title="Storefronts">
                {owned.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This seller has no storefront yet.
                  </p>
                ) : (
                  owned.map((store) => (
                    <div key={store.id} className="mb-4 last:mb-0">
                      <DetailGrid
                        data={{
                          name: store.name,
                          service_type: store.service_type,
                          verification: store.verification_status,
                          approved: String(store.is_approved),
                          online: String(store.is_online),
                          rating: `${Number(store.rating ?? 0).toFixed(1)} (${store.rating_count ?? 0})`,
                        }}
                      />
                    </div>
                  ))
                )}
              </Section>
              <Section title="Wallet">
                <DetailGrid
                  data={{
                    balance: wallet ? peso(wallet.balance) : "—",
                    pending: wallet ? peso(wallet.pending_balance) : "—",
                    currency: wallet?.currency ?? "—",
                  }}
                />
              </Section>
            </>
          );
        }}
      />

      <ActionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.banned ? "Ban this seller account?" : "Reactivate this seller account?"}
        description={pending?.name}
        confirmLabel={pending?.banned ? "Ban Account" : "Reactivate"}
        destructive
        noteLabel="Reason"
        requireNote
        pending={mutation.isPending}
        onConfirm={(note) =>
          pending &&
          mutation.mutate({
            userId: pending.userId,
            status: pending.banned ? "suspended" : "active",
            note: note || null,
          })
        }
      />
    </>
  );
}
