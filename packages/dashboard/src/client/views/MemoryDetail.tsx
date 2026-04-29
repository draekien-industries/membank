import { X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getMemory, patchMemory } from "@/lib/api";
import type { Memory, MemoryType } from "@/lib/types";

const TYPES: MemoryType[] = ["correction", "preference", "decision", "learning", "fact"];

interface MemoryDetailProps {
  id: string;
  onClose: () => void;
  onSaved: (memory: Memory) => void;
}

export function MemoryDetail({ id, onClose, onSaved }: MemoryDetailProps) {
  const [memory, setMemory] = useState<Memory | null>(null);
  const [content, setContent] = useState("");
  const [type, setType] = useState<MemoryType>("fact");
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setMemory(null);
    setDirty(false);
    void getMemory(id).then((m: Memory) => {
      setMemory(m);
      setContent(m.content);
      setType(m.type);
      setTagsInput(m.tags.join(", "));
    });
  }, [id]);

  const handleSave = async () => {
    if (!memory) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const updated = await patchMemory(memory.id, {
        content: content !== memory.content ? content : undefined,
        type: type !== memory.type ? type : undefined,
        tags: JSON.stringify(tags) !== JSON.stringify(memory.tags) ? tags : undefined,
      });
      setMemory(updated);
      setDirty(false);
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!memory) return;
    const updated = await patchMemory(memory.id, { needsReview: false });
    setMemory(updated);
    onSaved(updated);
  };

  if (!memory) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={memory.type}>{memory.type}</Badge>
          {memory.needsReview && <Badge variant="destructive">needs review</Badge>}
          {memory.pinned && <Badge variant="default">pinned</Badge>}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X weight="regular" />
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="memory-content"
            className="text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            Content
          </label>
          <Textarea
            id="memory-content"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setDirty(true);
            }}
            rows={8}
            className="min-h-32"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="memory-type"
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              Type
            </label>
            <Select
              id="memory-type"
              value={type}
              onChange={(e) => {
                setType(e.target.value as MemoryType);
                setDirty(true);
              }}
              className="w-full"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t[0]?.toUpperCase()}
                  {t.slice(1)}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="memory-tags"
              className="text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              Tags
            </label>
            <Input
              id="memory-tags"
              value={tagsInput}
              onChange={(e) => {
                setTagsInput(e.target.value);
                setDirty(true);
              }}
              placeholder="tag1, tag2"
            />
          </div>
        </div>

        {/* Metadata */}
        <div className="space-y-1 pt-2 border-t border-border">
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Scope</span>
            <span>{memory.scope}</span>
          </div>
          {memory.sourceHarness && (
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Source</span>
              <span>{memory.sourceHarness}</span>
            </div>
          )}
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Accessed</span>
            <span>{memory.accessCount}×</span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Updated</span>
            <span>{new Date(memory.updatedAt).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Created</span>
            <span>{new Date(memory.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
        {memory.needsReview && (
          <Button variant="outline" size="sm" onClick={() => void handleApprove()}>
            Approve
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="default"
          size="sm"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
