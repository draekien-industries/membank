import { X } from "@phosphor-icons/react";
import { useForm } from "@tanstack/react-form";
import { useBlocker } from "@tanstack/react-router";
import { useState } from "react";
import * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useMemoryDetail } from "@/hooks/useMemoryDetail";
import { memoriesCollection } from "@/lib/collections";
import type { Memory, MemoryType } from "@/lib/types";
import { MEMORY_TYPES, TYPE_DESCRIPTIONS } from "@/lib/types";
import { capitalize } from "@/lib/utils";

const memoryFormSchema = z.object({
  content: z.string().min(1, "Content is required."),
  type: z.enum(MEMORY_TYPES),
  tagsInput: z.string(),
});

interface MemoryDetailFormProps {
  memory: Memory;
  addProjectId: string;
  setAddProjectId: (id: string) => void;
  availableProjects: Memory["projects"];
  handleApprove: () => void;
  handleAddProject: () => Promise<void>;
  handleRemoveProject: (projectId: string) => Promise<void>;
  handleClose: () => void;
}

function MemoryDetailForm({
  memory,
  addProjectId,
  setAddProjectId,
  availableProjects,
  handleApprove,
  handleAddProject,
  handleRemoveProject,
  handleClose,
}: MemoryDetailFormProps) {
  const [saved, setSaved] = useState(false);

  const form = useForm({
    defaultValues: {
      content: memory.content,
      type: memory.type,
      tagsInput: memory.tags.join(", "),
    },
    validators: {
      onSubmit: memoryFormSchema,
    },
    onSubmit: ({ value }) => {
      const tags = value.tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      memoriesCollection.update(memory.id, (draft) => {
        if (value.content !== memory.content) draft.content = value.content;
        if (value.type !== memory.type) draft.type = value.type;
        if (JSON.stringify(tags) !== JSON.stringify(memory.tags)) draft.tags = tags;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const blocker = useBlocker({ shouldBlockFn: () => form.state.isDirty, withResolver: true });

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

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <FieldGroup>
          <form.Field name="content">
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel
                    htmlFor={field.name}
                    className="text-[11px] uppercase tracking-wide text-muted-foreground"
                  >
                    Content
                  </FieldLabel>
                  <Textarea
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    rows={8}
                    className="min-h-32 font-[var(--font-heading)] text-sm"
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>

          <div className="grid grid-cols-2 gap-3">
            <form.Field name="type">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel
                      htmlFor={field.name}
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Type
                    </FieldLabel>
                    <NativeSelect
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value as MemoryType)}
                      className="w-full"
                    >
                      {MEMORY_TYPES.map((t) => (
                        <NativeSelectOption key={t} value={t}>
                          {capitalize(t)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {TYPE_DESCRIPTIONS[field.state.value]}
                    </p>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="tagsInput">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel
                      htmlFor={field.name}
                      className="text-[11px] uppercase tracking-wide text-muted-foreground"
                    >
                      Tags
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="tag1, tag2"
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          </div>
        </FieldGroup>

        {/* Projects section */}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Projects</p>
          <div className="flex flex-wrap gap-1">
            {memory.projects.length === 0 && (
              <span className="text-[11px] text-muted-foreground">Global (no project)</span>
            )}
            {memory.projects.map((p) => (
              <Badge key={p.id} variant="secondary" className="gap-1 rounded-full text-[11px]">
                {p.name}
                <button
                  type="button"
                  onClick={() => void handleRemoveProject(p.id)}
                  className="hover:text-destructive transition-colors leading-none"
                  aria-label={`Remove from ${p.name}`}
                >
                  <X weight="regular" className="size-2.5" />
                </button>
              </Badge>
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
        <Collapsible className="group pt-2 border-t border-border">
          <CollapsibleTrigger className="flex items-center gap-1 cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none w-full">
            <span className="transition-transform group-data-[open]:rotate-90">›</span>
            Details
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 mt-2">
            {memory.sourceHarness && (
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Source</span>
                <span>{memory.sourceHarness}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Accessed</span>
              <span>{memory.accessCount}×</span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Updated</span>
              <span>{new Date(memory.updatedAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Created</span>
              <span>{new Date(memory.createdAt).toLocaleString()}</span>
            </div>
          </CollapsibleContent>
        </Collapsible>
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
        <Button
          variant="default"
          size="sm"
          disabled={!form.state.isDirty}
          onClick={() => void form.handleSubmit()}
        >
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}

interface MemoryDetailProps {
  id: string;
}

export function MemoryDetail({ id }: MemoryDetailProps) {
  const {
    memory,
    isLoading,
    addProjectId,
    setAddProjectId,
    availableProjects,
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
    <MemoryDetailForm
      key={memory.id}
      memory={memory}
      addProjectId={addProjectId}
      setAddProjectId={setAddProjectId}
      availableProjects={availableProjects}
      handleApprove={handleApprove}
      handleAddProject={handleAddProject}
      handleRemoveProject={handleRemoveProject}
      handleClose={handleClose}
    />
  );
}
