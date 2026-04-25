import "server-only";

import { DEFAULT_IMAGE_API_MODEL, GENERATION_STATUS, JOB_STATUS } from "@/lib/constants";
import { nowIso, parseJson, titleFromPrompt } from "@/lib/utils";
import { getDb, transaction } from "@/server/db";
import { deleteSessionImageDirectory } from "@/server/storage/images";

type SessionRow = {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export function listSessionsForUser(userId: string) {
  const rows = getDb()
    .prepare(`
      SELECT id, user_id, title, created_at, updated_at, last_message_at
      FROM sessions
      WHERE user_id = ?
      ORDER BY last_message_at DESC
    `)
    .all(userId) as SessionRow[];

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title || "新会话",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  }));
}

export function createSession(userId: string, title = "新会话") {
  const now = nowIso();
  const id = crypto.randomUUID();

  getDb()
    .prepare(`
      INSERT INTO sessions (id, user_id, title, status, created_at, updated_at, last_message_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `)
    .run(id, userId, title, now, now, now);

  return id;
}

export function getSessionById(sessionId: string) {
  const row = getDb()
    .prepare(`
      SELECT id, user_id, title, created_at, updated_at, last_message_at
      FROM sessions
      WHERE id = ?
    `)
    .get(sessionId) as SessionRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    title: row.title || "新会话",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
  };
}

export const MESSAGES_PAGE_SIZE = 50;

export type ChatMessageView = {
  id: string;
  role: string;
  messageType: string;
  contentText: string | null;
  createdAt: string;
  generationId: string | null;
  publicUrl: string | null;
  outputMode: string | null;
  explanationText: string | null;
  generationStatus: string | null;
  generationPublicError: string | null;
};

type MessagesPage = {
  messages: ChatMessageView[];
  hasMore: boolean;
};

export function getMessagesForSession(
  sessionId: string,
  options: { limit?: number; before?: string } = {},
): MessagesPage {
  const limit = Math.min(Math.max(options.limit ?? MESSAGES_PAGE_SIZE, 1), 200);
  const fetchLimit = limit + 1;

  const params: (string | number)[] = [sessionId];
  let whereClause = "m.session_id = ?";

  if (options.before) {
    whereClause += " AND m.created_at < ?";
    params.push(options.before);
  }

  params.push(fetchLimit);

  const rows = getDb()
    .prepare(
      `SELECT
         m.id,
         m.role,
         m.message_type,
         m.content_text,
         m.created_at,
         g.id as generation_id,
         g.public_url,
         g.output_mode,
         g.explanation_text,
         g.status as generation_status,
         g.public_error_message as generation_public_error
       FROM chat_messages m
       LEFT JOIN generations g ON g.id = m.generation_id
       WHERE ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT ?`,
    )
    .all(...params) as Array<{
    id: string;
    role: string;
    message_type: string;
    content_text: string | null;
    created_at: string;
    generation_id: string | null;
    public_url: string | null;
    output_mode: string | null;
    explanation_text: string | null;
    generation_status: string | null;
    generation_public_error: string | null;
  }>;

  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;

  const messages: ChatMessageView[] = slice
    .map((row) => ({
      id: row.id,
      role: row.role,
      messageType: row.message_type,
      contentText: row.content_text,
      createdAt: row.created_at,
      generationId: row.generation_id,
      publicUrl: row.public_url,
      outputMode: row.output_mode,
      explanationText: row.explanation_text,
      generationStatus: row.generation_status,
      generationPublicError: row.generation_public_error,
    }))
    .reverse();

  return { messages, hasMore };
}

export function getGenerationById(generationId: string) {
  const row = getDb()
    .prepare(`
      SELECT *
      FROM generations
      WHERE id = ?
    `)
    .get(generationId) as
    | {
        id: string;
        session_id: string;
        parent_generation_id: string | null;
        original_prompt: string;
        effective_prompt: string;
        negative_prompt: string | null;
        prompt_json: string;
        seed: number | null;
        keep_seed: number;
        aspect_ratio: string;
        mime_type: string;
        status: string;
        output_mode: string;
        explanation_text: string | null;
        explanation_status: string | null;
        storage_path: string | null;
        public_url: string | null;
        file_size_bytes: number | null;
        error_message: string | null;
        public_error_message: string | null;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    parentGenerationId: row.parent_generation_id,
    originalPrompt: row.original_prompt,
    effectivePrompt: row.effective_prompt,
    negativePrompt: row.negative_prompt,
    promptJson: parseJson(row.prompt_json, {}),
    seed: row.seed,
    keepSeed: Boolean(row.keep_seed),
    aspectRatio: row.aspect_ratio,
    mimeType: row.mime_type,
    status: row.status,
    outputMode: row.output_mode,
    explanationText: row.explanation_text,
    explanationStatus: row.explanation_status,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    fileSizeBytes: row.file_size_bytes,
    errorMessage: row.error_message,
    publicErrorMessage: row.public_error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export function getJobById(jobId: string) {
  const row = getDb()
    .prepare(
      `SELECT j.id, j.generation_id, j.session_id, s.user_id, j.status, j.progress,
              j.error_message, j.public_error_message
       FROM jobs j
       JOIN sessions s ON s.id = j.session_id
       WHERE j.id = ?`,
    )
    .get(jobId) as
    | {
        id: string;
        generation_id: string;
        session_id: string;
        user_id: string;
        status: string;
        progress: number;
        error_message: string | null;
        public_error_message: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    generationId: row.generation_id,
    sessionId: row.session_id,
    userId: row.user_id,
    status: row.status,
    progress: row.progress,
    errorMessage: row.error_message,
    publicErrorMessage: row.public_error_message,
  };
}

export class CreateMessageError extends Error {
  constructor(public reason: "invalid_parent") {
    super(reason);
  }
}

export type DeliveryTarget = {
  channel: "napcat";
  userId?: number;
  groupId?: number;
};

export function findOrCreateSession(input: {
  userId: string;
  title: string;
}) {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, user_id, title, created_at, updated_at, last_message_at
       FROM sessions WHERE user_id = ? AND title = ? LIMIT 1`,
    )
    .get(input.userId, input.title) as SessionRow | undefined;

  if (existing) {
    return existing.id;
  }

  return createSession(input.userId, input.title);
}

export function createNapcatGeneration(input: {
  userId: string;
  sessionId: string;
  content: string;
  delivery: DeliveryTarget;
  outputMode?: "image_only" | "image_with_commentary";
}) {
  return transaction((db) => {
    const now = nowIso();
    const messageId = crypto.randomUUID();
    const generationId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const outputMode = input.outputMode ?? "image_only";

    db.prepare(`
      INSERT INTO chat_messages (
        id, session_id, role, message_type, content_text, generation_id, job_id, created_at
      )
      VALUES (?, ?, 'user', 'text', ?, ?, ?, ?)
    `).run(messageId, input.sessionId, input.content, generationId, jobId, now);

    db.prepare(`
      INSERT INTO generations (
        id, session_id, parent_generation_id, trigger_message_id, provider, model,
        original_prompt, effective_prompt, negative_prompt, prompt_json, seed, keep_seed,
        aspect_ratio, image_size, mime_type, status, vertex_request_id, output_mode,
        explanation_text, explanation_status, storage_bucket, storage_path, public_url,
        width, height, file_size_bytes, error_code, error_message, created_at, updated_at, completed_at,
        delivery_channel, delivery_target_json, delivery_status
      )
      VALUES (?, ?, NULL, ?, 'openai_compatible', ?, ?, ?, NULL, ?, NULL, 0, '1:1', NULL, 'image/png', ?, NULL, ?, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL, ?, ?, 'pending')
    `).run(
      generationId,
      input.sessionId,
      messageId,
      DEFAULT_IMAGE_API_MODEL,
      input.content,
      input.content,
      JSON.stringify({}),
      GENERATION_STATUS.queued,
      outputMode,
      now,
      now,
      input.delivery.channel,
      JSON.stringify({
        userId: input.delivery.userId ?? null,
        groupId: input.delivery.groupId ?? null,
      }),
    );

    db.prepare(`
      INSERT INTO jobs (
        id, session_id, generation_id, job_type, queue_name, queue_job_id,
        status, attempt_count, progress, error_message, created_at, updated_at
      )
      VALUES (?, ?, ?, 'image_generation', 'image-generation', ?, ?, 0, 0, NULL, ?, ?)
    `).run(jobId, input.sessionId, generationId, jobId, JOB_STATUS.waiting, now, now);

    db.prepare(`
      UPDATE sessions
      SET title = COALESCE(NULLIF(title, ''), ?), updated_at = ?, last_message_at = ?
      WHERE id = ?
    `).run(titleFromPrompt(input.content), now, now, input.sessionId);

    return { messageId, generationId, jobId };
  });
}

export function getGenerationDelivery(generationId: string) {
  const row = getDb()
    .prepare(
      `SELECT delivery_channel, delivery_target_json, delivery_status
       FROM generations WHERE id = ?`,
    )
    .get(generationId) as
    | {
        delivery_channel: string | null;
        delivery_target_json: string | null;
        delivery_status: string | null;
      }
    | undefined;

  if (!row || !row.delivery_channel) return null;

  let target: { userId?: number | null; groupId?: number | null } = {};
  if (row.delivery_target_json) {
    try {
      target = JSON.parse(row.delivery_target_json);
    } catch {
      // ignore
    }
  }

  return {
    channel: row.delivery_channel,
    target,
    status: row.delivery_status,
  };
}

export function setGenerationDeliveryStatus(
  generationId: string,
  status: "pending" | "sent" | "failed",
  errorMessage?: string | null,
) {
  void errorMessage;
  getDb()
    .prepare(
      `UPDATE generations SET delivery_status = ?, updated_at = ? WHERE id = ?`,
    )
    .run(status, nowIso(), generationId);
}

export function createMessageAndGeneration(input: {
  sessionId: string;
  content: string;
  mode: "new_image" | "modify_last";
  parentGenerationId?: string | null;
  keepSeed: boolean;
  outputMode: "image_only" | "image_with_commentary";
}) {
  return transaction((db) => {
    const now = nowIso();
    const messageId = crypto.randomUUID();
    const generationId = crypto.randomUUID();
    const jobId = crypto.randomUUID();

    if (input.parentGenerationId) {
      const parent = db
        .prepare(`SELECT session_id FROM generations WHERE id = ?`)
        .get(input.parentGenerationId) as
        | { session_id: string }
        | undefined;

      if (!parent || parent.session_id !== input.sessionId) {
        throw new CreateMessageError("invalid_parent");
      }
    }

    db.prepare(`
      INSERT INTO chat_messages (
        id, session_id, role, message_type, content_text, generation_id, job_id, created_at
      )
      VALUES (?, ?, 'user', 'text', ?, ?, ?, ?)
    `).run(messageId, input.sessionId, input.content, generationId, jobId, now);

    db.prepare(`
      INSERT INTO generations (
        id, session_id, parent_generation_id, trigger_message_id, provider, model,
        original_prompt, effective_prompt, negative_prompt, prompt_json, seed, keep_seed,
        aspect_ratio, image_size, mime_type, status, vertex_request_id, output_mode,
        explanation_text, explanation_status, storage_bucket, storage_path, public_url,
        width, height, file_size_bytes, error_code, error_message, created_at, updated_at, completed_at
      )
      VALUES (?, ?, ?, ?, 'openai_compatible', ?, ?, ?, ?, ?, NULL, ?, '1:1', NULL, 'image/png', ?, NULL, ?, NULL, 'none', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, NULL)
    `).run(
      generationId,
      input.sessionId,
      input.parentGenerationId || null,
      messageId,
      DEFAULT_IMAGE_API_MODEL,
      input.content,
      input.content,
      null,
      JSON.stringify({}),
      input.keepSeed ? 1 : 0,
      GENERATION_STATUS.queued,
      input.outputMode,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO jobs (
        id, session_id, generation_id, job_type, queue_name, queue_job_id,
        status, attempt_count, progress, error_message, created_at, updated_at
      )
      VALUES (?, ?, ?, 'image_generation', 'image-generation', ?, ?, 0, 0, NULL, ?, ?)
    `).run(jobId, input.sessionId, generationId, jobId, JOB_STATUS.waiting, now, now);

    db.prepare(`
      UPDATE sessions
      SET title = COALESCE(NULLIF(title, ''), ?), updated_at = ?, last_message_at = ?
      WHERE id = ?
    `).run(titleFromPrompt(input.content), now, now, input.sessionId);

    return { messageId, generationId, jobId };
  });
}

export function updateJobStatus(input: {
  jobId: string;
  status: string;
  progress: number;
  errorMessage?: string | null;
  publicErrorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
}) {
  getDb()
    .prepare(
      `UPDATE jobs
       SET status = ?, progress = ?, error_message = ?, public_error_message = ?,
           updated_at = ?, started_at = COALESCE(?, started_at), finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.progress,
      input.errorMessage ?? null,
      input.publicErrorMessage ?? null,
      nowIso(),
      input.startedAt ?? null,
      input.finishedAt ?? null,
      input.jobId,
    );
}

export function updateGenerationQueuedPayload(input: {
  generationId: string;
  effectivePrompt: string;
  negativePrompt: string;
  promptJson: object;
  seed: number;
  aspectRatio: string;
  explanationStatus: string;
}) {
  getDb()
    .prepare(`
      UPDATE generations
      SET effective_prompt = ?, negative_prompt = ?, prompt_json = ?, seed = ?, aspect_ratio = ?, explanation_status = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      input.effectivePrompt,
      input.negativePrompt,
      JSON.stringify(input.promptJson),
      input.seed,
      input.aspectRatio,
      input.explanationStatus,
      nowIso(),
      input.generationId,
    );
}

export function markGenerationProcessing(generationId: string) {
  getDb()
    .prepare(`UPDATE generations SET status = ?, updated_at = ? WHERE id = ?`)
    .run(GENERATION_STATUS.generating, nowIso(), generationId);
}

export function markGenerationCompleted(input: {
  generationId: string;
  mimeType: string;
  effectivePrompt: string;
  publicUrl: string;
  storagePath: string;
  fileSizeBytes: number;
  explanationText: string | null;
  explanationStatus: string;
}) {
  const now = nowIso();

  transaction((db) => {
    const updateResult = db
      .prepare(
        `UPDATE generations
         SET status = ?, mime_type = ?, effective_prompt = ?, public_url = ?, storage_path = ?,
             file_size_bytes = ?, explanation_text = ?, explanation_status = ?, updated_at = ?, completed_at = ?
         WHERE id = ? AND status <> ?`,
      )
      .run(
        GENERATION_STATUS.completed,
        input.mimeType,
        input.effectivePrompt,
        input.publicUrl,
        input.storagePath,
        input.fileSizeBytes,
        input.explanationText,
        input.explanationStatus,
        now,
        now,
        input.generationId,
        GENERATION_STATUS.completed,
      );

    if (updateResult.changes === 0) {
      return;
    }

    const existing = db
      .prepare(
        `SELECT id FROM chat_messages
         WHERE generation_id = ? AND role = 'assistant'
         LIMIT 1`,
      )
      .get(input.generationId) as { id: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE chat_messages SET content_text = ? WHERE id = ?`,
      ).run(input.explanationText, existing.id);
      return;
    }

    const generation = db
      .prepare(`SELECT session_id FROM generations WHERE id = ?`)
      .get(input.generationId) as { session_id: string } | undefined;

    if (!generation) {
      return;
    }

    db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, message_type, content_text, generation_id, job_id, created_at)
       VALUES (?, ?, 'assistant', 'image', ?, ?, NULL, ?)`,
    ).run(
      crypto.randomUUID(),
      generation.session_id,
      input.explanationText,
      input.generationId,
      now,
    );
  });
}

export function markGenerationFailed(
  generationId: string,
  internalMessage: string,
  publicMessage: string,
) {
  getDb()
    .prepare(
      `UPDATE generations
       SET status = ?, error_message = ?, public_error_message = ?,
           explanation_status = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      GENERATION_STATUS.failed,
      internalMessage,
      publicMessage,
      "failed",
      nowIso(),
      generationId,
    );
}

export class RetryGenerationError extends Error {
  constructor(public reason: "not_found" | "forbidden" | "not_failed") {
    super(reason);
  }
}

export function retryFailedGeneration(input: { generationId: string; userId: string }) {
  return transaction((db) => {
    const row = db
      .prepare(
        `SELECT g.id, g.session_id, g.status, s.user_id
         FROM generations g
         JOIN sessions s ON s.id = g.session_id
         WHERE g.id = ?`,
      )
      .get(input.generationId) as
      | { id: string; session_id: string; status: string; user_id: string }
      | undefined;

    if (!row) {
      throw new RetryGenerationError("not_found");
    }

    if (row.user_id !== input.userId) {
      throw new RetryGenerationError("forbidden");
    }

    if (row.status !== GENERATION_STATUS.failed) {
      throw new RetryGenerationError("not_failed");
    }

    const now = nowIso();
    const jobId = crypto.randomUUID();

    db.prepare(
      `UPDATE generations
       SET status = ?, error_message = NULL, error_code = NULL,
           explanation_status = 'none', explanation_text = NULL, updated_at = ?
       WHERE id = ?`,
    ).run(GENERATION_STATUS.queued, now, row.id);

    db.prepare(
      `INSERT INTO jobs (
         id, session_id, generation_id, job_type, queue_name, queue_job_id,
         status, attempt_count, progress, error_message, created_at, updated_at
       )
       VALUES (?, ?, ?, 'image_generation', 'image-generation', ?, ?, 0, 0, NULL, ?, ?)`,
    ).run(jobId, row.session_id, row.id, jobId, JOB_STATUS.waiting, now, now);

    db.prepare(
      `UPDATE sessions SET updated_at = ?, last_message_at = ? WHERE id = ?`,
    ).run(now, now, row.session_id);

    return { jobId, sessionId: row.session_id };
  });
}

export function deleteSessionWithAssets(sessionId: string) {
  transaction((db) => {
    deleteSessionImageDirectory(sessionId);
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
  });
}

export function listPendingJobs() {
  return getDb()
    .prepare(`
      SELECT id, generation_id
      FROM jobs
      WHERE status IN (?, ?)
      ORDER BY created_at ASC
    `)
    .all(JOB_STATUS.waiting, JOB_STATUS.active) as Array<{
    id: string;
    generation_id: string;
  }>;
}

export function listSessionsForAdmin() {
  return getDb()
    .prepare(`
      SELECT s.id, s.title, u.username, s.created_at, s.last_message_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      ORDER BY s.last_message_at DESC
    `)
    .all() as Array<{
    id: string;
    title: string | null;
    username: string;
    created_at: string;
    last_message_at: string;
  }>;
}
