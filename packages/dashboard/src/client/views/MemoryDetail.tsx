import { X } from "@phosphor-icons/react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addMemoryProject, removeMemoryProject } from "@/lib/api";
import { memoriesCollection, projectsCollection, queryClient } from "@/lib/collections";
import type { MemoryType } from "@/lib/types";

const TYPES: MemoryType[] = ["correction", "preference", "decision", "learning", "fact"];

interface MemoryDetailProps {
  id: string;
}

export function MemoryDetail({ id }: MemoryDetailProps) {
  const navigate = useNavigate();

  const { data: results = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).where(({ m }) => eq(m.id, id)),
    [id]
  );
  const memory = results[0] ?? null;

  const [content, setContent] = useState("");
  const [type, setType] = useState<MemoryType>("fact");
  const [tagsInput, setTagsInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [addProjectId, setAddProjectId] = useState("");

  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  useEffect(() => {
    if (memory && !initialized) {
      setContent(memory.content);
      setType(memory.type);
      setTagsInput(memory.tags.join(", "));
      setInitialized(true);
    }
  }, [memory, initialized]);

  const dirty =
    memory !== null &&
    (content !== memory.content || type !== memory.type || tagsInput !== memory.tags.join(", "));

  const handleSave = () => {
    if (!memory || !dirty) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    memoriesCollection.update(id, (draft) => {
      if (content !== memory.content) draft.content = content;
      if (type !== memory.type) draft.type = type;
      if (JSON.stringify(tags) !== JSON.stringify(memory.tags)) draft.tags = tags;
    });
  };

  const handleApprove = () => {
    memoriesCollection.update(id, (draft) => {
      draft.needsReview = false;
    });
  };

  const handleAddProject = async () => {
    if (!addProjectId) return;
    await addMemoryProject(id, addProjectId);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
    setAddProjectId("");
  };

  const handleRemoveProject = async (projectId: string) => {
    await removeMemoryProject(id, projectId);
    await queryClient.invalidateQueries({ queryKey: ["memories"] });
  };

  if (isLoading || !memory) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
        {isLoading ? "Loading…" : "Memory not found"}
      </div>
    );
  }

  const availableProjects = allProjects.filter(
    (p) => !memory.projects.some((mp) => mp.id === p.id)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant={memory.type}>{memory.type}</Badge>
          {memory.needsReview && <Badge variant="destructive">needs review</Badge>}
          {memory.pinned && <Badge variant="default">pinned</Badge>}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void navigate({ to: "/memories" })}
          aria-label="Close"
        >
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
            onChange={(e) => setContent(e.target.value)}
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
              onChange={(e) => setType(e.target.value as MemoryType)}
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
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="tag1, tag2"
            />
          </div>
        </div>

        {/* Projects section */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Projects</p>
          <div className="flex flex-wrap gap-1">
            {memory.projects.length === 0 && (
              <span className="text-[10px] text-muted-foreground">Global (no project)</span>
            )}
            {memory.projects.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-[10px] text-accent-foreground"
              >
                {p.name}
                <button
                  type="button"
                  onClick={() => void handleRemoveProject(p.id)}
                  className="hover:text-destructive transition-colors leading-none"
                  aria-label={`Remove from ${p.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          {availableProjects.length > 0 && (
            <div className="flex gap-1">
              <Select
                value={addProjectId}
                onChange={(e) => setAddProjectId(e.target.value)}
                className="flex-1 text-[10px]"
              >
                <option value="">Add to project…</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
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
        <div className="space-y-1 pt-2 border-t border-border">
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
          <Button variant="outline" size="sm" onClick={handleApprove}>
            Approve
          </Button>
        )}
        <div className="flex-1" />
        <Button variant="default" size="sm" onClick={handleSave} disabled={!dirty}>
          Save
        </Button>
      </div>
    </div>
  );
}
