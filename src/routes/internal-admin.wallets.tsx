import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AdminTable,
  FilterBar,
  FilterChip,
  Pill,
  SearchBox,
  Td,
  dateTime,
  shortId,
  statusTone,
} from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { peso } from "@/lib/currency";
import { walletLedgerQuery, walletsQuery } from "@/lib/admin/queries";

export const Route = createFileRoute("/internal-admin/wallets")({
  component: WalletsPage,
});

const TYPES = ["all", "seller", "rider"] as const;

function WalletsPage() {
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [search, setSearch] = useState("");
  const { data: wallets, isLoading } = useQuery(walletsQuery());
  const { data: ledger } = useQuery(walletLedgerQuery("all", 150));

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (wallets ?? []).filter((w) => {
      if (type !== "all" && w.wallet_type !== type) return false;
      return !term || w.user_id.toLowerCase().includes(term) || w.id.toLowerCase().includes(term);
    });
  }, [wallets, type, search]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, w) => ({
          balance: acc.balance + Number(w.balance ?? 0),
          pending: acc.pending + Number(w.pending_balance ?? 0),
        }),
        { balance: 0, pending: 0 },
      ),
    [rows],
  );

  return (
    <>
      <PageHeader
        title="Wallets"
        description="Seller and rider wallet balances plus the platform transaction ledger."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Available float" value={peso(totals.balance)} icon={Wallet} />
        <StatCard label="Pending float" value={peso(totals.pending)} icon={Wallet} />
        <StatCard label="Wallets" value={String(rows.length)} icon={Wallet} />
      </div>

      <Panel title="Wallet accounts" className="mt-6">
        <FilterBar>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by user or wallet ID"
          />
          {TYPES.map((t) => (
            <FilterChip key={t} active={type === t} onClick={() => setType(t)}>
              {t}
            </FilterChip>
          ))}
        </FilterBar>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading wallets…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No wallets"
            description="Wallets are created when partners are approved."
          />
        ) : (
          <AdminTable head={["Owner", "Type", "Balance", "Pending", "Active", "Opened"]}>
            {rows.map((wallet) => (
              <tr key={wallet.id}>
                <Td className="text-sm">{shortId(wallet.user_id)}</Td>
                <Td className="text-xs uppercase">{wallet.wallet_type}</Td>
                <Td className="text-sm font-semibold">{peso(wallet.balance)}</Td>
                <Td className="text-sm">{peso(wallet.pending_balance)}</Td>
                <Td>
                  <Pill tone={wallet.is_active ? "success" : "danger"}>
                    {wallet.is_active ? "active" : "inactive"}
                  </Pill>
                </Td>
                <Td className="text-xs text-muted-foreground">{dateTime(wallet.created_at)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>

      <Panel
        title="Transaction ledger"
        description="Most recent wallet movements across the platform."
        className="mt-6"
      >
        {(ledger ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No wallet transactions yet.
          </p>
        ) : (
          <AdminTable head={["When", "Wallet", "Kind", "Amount", "Balance after", "Status"]}>
            {(ledger ?? []).map((tx) => (
              <tr key={tx.id}>
                <Td className="text-xs text-muted-foreground">{dateTime(tx.created_at)}</Td>
                <Td className="text-xs">{shortId(tx.wallet_id)}</Td>
                <Td className="text-xs capitalize">{tx.kind.replace(/_/g, " ")}</Td>
                <Td className="text-sm font-semibold">{peso(tx.amount)}</Td>
                <Td className="text-sm">{peso(tx.new_balance)}</Td>
                <Td>
                  <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>
    </>
  );
}
