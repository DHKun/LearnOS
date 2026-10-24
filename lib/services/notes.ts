import { sql } from "drizzle-orm";

import { mapPgError, one, rpc } from "@/lib/db/query";
import type { NoteData } from "@/lib/types";

export async function getNote(studentId: string, lessonId: string): Promise<NoteData> {
  const data = await one<{ content: string; updated_at: string }>(sql`
    select content, updated_at
    from public.notes
    where student_id = ${studentId}::uuid and lesson_id = ${lessonId}::uuid
    limit 1
  `);
  return { content: data?.content ?? "", updatedAt: data?.updated_at ?? null };
}

export async function saveNote(
  studentId: string,
  lessonId: string,
  content: string,
): Promise<NoteData> {
  try {
    const data = await rpc<{ updatedAt: string }>("save_note", {
      p_student: studentId,
      p_lesson: lessonId,
      p_content: content,
    });
    return { content, updatedAt: data.updatedAt };
  } catch (error) {
    mapPgError(error);
  }
}
