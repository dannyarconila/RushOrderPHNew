import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FilterChip } from "@/components/admin/primitives";
import { PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { broadcastAnnouncement } from "@/lib/admin/mutations";
import type { AppRole } from "@/types";

export const Route = createFileRoute("/internal-admin/announcements")({
  component: AnnouncementsPage,
});

const AUDIENCES: { role: AppRole; label: string }[] = [
  { role: "customer", label: "Customers" },
  { role: "seller", label: "Sellers" },
  { role: "rider", label: "Riders" },
];

function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [audiences, setAudiences] = useState<AppRole[]>(["customer"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const mutation = useMutation({
    mutationFn: broadcastAnnouncement,
    onSuccess: (count) => {
      toast.success(`Announcement sent to ${count} member${count === 1 ? "" : "s"}.`);
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      setTitle("");
      setBody("");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = (role: AppRole) =>
    setAudiences((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const disabled = !title.trim() || !body.trim() || audiences.length === 0 || mutation.isPending;

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Send an in-app notification to a chosen audience. Delivered instantly to their notification feed."
      />

      <Panel title="Compose announcement" className="max-w-2xl">
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (disabled) return;
            mutation.mutate({ audiences, title: title.trim(), body: body.trim() });
          }}
        >
          <div className="space-y-2">
            <Label>Audience</Label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((audience) => (
                <FilterChip
                  key={audience.role}
                  active={audiences.includes(audience.role)}
                  onClick={() => toggle(audience.role)}
                >
                  {audience.label}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-title">Title</Label>
            <Input
              id="announcement-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Scheduled maintenance this Sunday"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="announcement-body">Message</Label>
            <Textarea
              id="announcement-body"
              value={body}
              maxLength={1000}
              rows={6}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Share the details your members need to know."
            />
            <p className="text-xs text-muted-foreground">{body.length}/1000 characters</p>
          </div>

          <Button type="submit" disabled={disabled}>
            <Megaphone className="size-4" />
            {mutation.isPending ? "Sending…" : "Send announcement"}
          </Button>
        </form>
      </Panel>
    </>
  );
}
