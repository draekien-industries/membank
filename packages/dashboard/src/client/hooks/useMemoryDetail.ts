import { eq, useLiveQuery } from "@tanstack/react-db";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { addMemoryProject, removeMemoryProject } from "@/lib/api";
import { memoriesCollection, projectsCollection, queryClient } from "@/lib/collections";
import type { MemoryType } from "@/lib/types";

export function useMemoryDetail(id: string) {
  const navigate = useNavigate();

  const { data: results = [], isLoading } = useLiveQuery(
    (q) => q.from({ m: memoriesCollection }).where(({ m }) => eq(m.id, id)),
    [id]
  );
  const memory = results[0] ?? null;

  const { data: allProjects = [] } = useLiveQuery((q) => q.from({ p: projectsCollection }), []);

  const [content, setContent] = useState("");
  const [type, setType] = useState<MemoryType>("fact");
  const [tagsInput, setTagsInput] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [addProjectId, setAddProjectId] = useState("");
  const [saved, setSaved] = useState(false);

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

  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true });

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
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleApprove = () => {
    memoriesCollection.update(id, (draft) => {
      draft.needsReview = false;
    });
  };

  const handleAddProject = async () => {
    if (!addProjectId) return;
    try {
      await addMemoryProject(id, addProjectId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
      setAddProjectId("");
    } catch {
      toast.error("Failed to add project — try again");
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    try {
      await removeMemoryProject(id, projectId);
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    } catch {
      toast.error("Failed to remove project — try again");
    }
  };

  const handleClose = () => void navigate({ to: "/memories" });

  const availableProjects = allProjects.filter(
    (p) => !memory?.projects.some((mp) => mp.id === p.id)
  );

  return {
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
  };
}
