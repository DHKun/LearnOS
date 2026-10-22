import { mapDatabaseError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NoteData } from "@/lib/types";

export async function getNote(studentId: string, lessonId: string): Promise<NoteData> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("notes")
    .select("content,updated_at")
    .eq("student_id", studentId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (error) throw error;
  return { content: data?.content ?? "", updatedAt: data?.updated_at ?? null };
}

export async function saveNote(
  studentId: string,
  lessonId: string,
  content: string,
): Promise<NoteData> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("save_note", {
    p_student: studentId,
    p_lesson: lessonId,
    p_content: content,
  });

  if (error) mapDatabaseError(error);
  return { content, updatedAt: (data as { updatedAt: string }).updatedAt };
}
