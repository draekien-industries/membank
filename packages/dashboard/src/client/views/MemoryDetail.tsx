import { X } from "@phosphor-icons/react";
import { FieldLabel } from "@/components/FieldLabel";
import { MetaRow } from "@/components/MetaRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useMemoryDetail } from "@/hooks/useMemoryDetail";
import type { MemoryType } from "@/lib/types";
import { MEMORY_TYPES, TYPE_DESCRIPTIONS } from "@/lib/types";
import { capitalize } from "@/lib/utils";

interface MemoryDetailProps {
  id: string;
}

export function MemoryDetail({ id }: MemoryDetailProps) {
  const {
    memory,
    isLoading,
    content,
    setContent,
    type,
    setType,
    tagsInput,
    setTagsInput,
    addProjectId,
    setAddProjectId,
    saved,
    dirty,
    blocker,
    availableProjects,
    handleSave,
    handleApprove,
    handleAddProject,
    handleRemoveProject,
    handleClose,
  } = useMemoryDetail(id);

  if (isLoading || !memory) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        {isLoading ? "Loading…" : "Memory not found"}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={memory.type}>{memory.type}</Badge>
          {memory.needsReview && (
            <Badge
              variant="destructive"
              title="Flagged for review — possible duplicate or conflict with another memory"
            >
              needs review
            </Badge>
          )}
          {memory.pinned && <Badge variant="default">pinned</Badge>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={handleClose} aria-label="Close">
          <X weight="regular" />
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="memory-content">Content</FieldLabel>
          <Textarea
            id="memory-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="min-h-32 font-[var(--font-heading)] text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <FieldLabel htmlFor="memory-type">Type</FieldLabel>
            <NativeSelect
              id="memory-type"
              value={type}
              onChange={(e) => setType(e.target.value as MemoryType)}
              className="w-full"
            >
              {MEMORY_TYPES.map((t) => (
                <NativeSelectOption key={t} value={t}>
                  {capitalize(t)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-[10px] text-muted-foreground leading-snug">
              {TYPE_DESCRIPTIONS[type]}
            </p>
          </div>

          <div className="space-y-1.5">
            <FieldLabel htmlFor="memory-tags">Tags</FieldLabel>
            <Input
              id="memory-tags"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2"
            />
          </div>
        </div>

        {/* Projects section */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Projects</p>
          <div className="flex flex-wrap gap-1">
            {memory.projects.length === 0 && (
              <span className="text-[11px] text-muted-foreground">Global (no project)</span>
            )}
            {memory.projects.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-[11px] text-accent-foreground"
              >
                {p.name}
                <button
                  type="button"
                  onClick={() => void handleRemoveProject(p.id)}
                  className="hover:text-destructive transition-colors leading-none"
                  aria-label={`Remove from ${p.name}`}
                >
                  <X weight="regular" className="size-2.5" />
                </button>
              </span>
            ))}
          </div>
          {availableProjects.length > 0 && (
            <div className="flex gap-1">
              <NativeSelect
                value={addProjectId}
                onChange={(e) => setAddProjectId(e.target.value)}
                size="sm"
                className="flex-1"
              >
                <NativeSelectOption value="">Add to project…</NativeSelectOption>
                {availableProjects.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                size="sm"
                disabled={!addProjectId}
                onClick={() => void handleAddProject()}
              >
                +
              </Button>
            </div>
          )}
        </div>

        {/* Metadata */}
        <details className="group pt-2 border-t border-border">
          <summary className="flex items-center gap-1 cursor-pointer list-none text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none">
            <span className="transition-transform group-open:rotate-90">›</span>
            Details
          </summary>
          <div className="space-y-1 mt-2">
            {memory.sourceHarness && <MetaRow label="Source" value={memory.sourceHarness} />}
            <MetaRow label="Accessed" value={`${memory.accessCount}×`} />
            <MetaRow label="Updated" value={new Date(memory.updatedAt).toLocaleString()} />
            <MetaRow label="Created" value={new Date(memory.createdAt).toLocaleString()} />
          </div>
        </details>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
        {blocker.status === "blocked" && (
          <>
            <span className="text-xs text-destructive">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => blocker.proceed()}>
              Discard
            </Button>
            <Button variant="outline" size="sm" onClick={() => blocker.reset()}>
              Keep editing
            </Button>
          </>
        )}
        {memory.needsReview && blocker.status !== "blocked" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleApprove}
            title="Mark as reviewed — this memory was flagged as a possible duplicate or conflict"
          >
            Mark reviewed
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="default" size="sm" onClick={handleSave} disabled={!dirty}>
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}
