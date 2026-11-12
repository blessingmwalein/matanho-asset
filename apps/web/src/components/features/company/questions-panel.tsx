'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { answerQuestionSchema, formatDateTime, REPORTING_PACK } from '@nexus/shared';
import { api, ApiError, documentUrl } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/idempotency';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { FileChip, FileDropzone } from '@/components/nx/blocks';
import { Panel, PanelBody, PanelHeader } from '@/components/nx/layout';
import { StatusIndicator } from '@/components/nx/status';
import type { QuestionView } from './types';

const sectionTitle = (key: string | null) => (key ? (REPORTING_PACK.find((s) => s.key === key)?.title ?? null) : null);

function AnswerForm({ q, onDone }: { q: QuestionView; onDone: () => void }) {
  const key = useIdempotencyKey();
  const [answer, setAnswer] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.set('answer', answer.trim());
      if (file) fd.set('file', file);
      return api<{ ok: boolean; openQuestions: number; resubmitted: boolean }>(`/company-portal/questions/${q.id}/answer`, { method: 'POST', form: fd, idempotencyKey: key.get() });
    },
    onSuccess: (r) => {
      key.reset();
      toast.success('Answer sent', {
        description: r.resubmitted ? 'All questions are answered, so the pack is back with the investment team for review.' : r.openQuestions > 0 ? `${r.openQuestions} question${r.openQuestions > 1 ? 's' : ''} still need an answer.` : 'The investment team has been notified.',
      });
      onDone();
    },
    onError: (e) => {
      key.reset();
      setError(e instanceof ApiError ? (e.errors?.answer ?? e.errors?.file ?? e.message) : 'Could not send the answer');
    },
  });

  const submit = () => {
    const parsed = answerQuestionSchema.safeParse({ answer });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Write an answer');
      return;
    }
    setError(null);
    send.mutate();
  };

  return (
    <div className="mt-3">
      <label htmlFor={`answer-${q.id}`} className="mb-1.5 block text-[11.5px] font-semibold text-ink-2">
        Your answer
      </label>
      <Textarea id={`answer-${q.id}`} rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} aria-invalid={!!error} placeholder="Write your answer for the investment team" />
      <div className="mt-2">
        {file ? <FileChip name={file.name} size={file.size} mime={file.type} onRemove={() => setFile(null)} /> : <FileDropzone compact title="Attach a supporting file (optional)" onFiles={(f) => setFile(f[0] ?? null)} />}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[11.5px] font-medium text-danger">
          {error}
        </p>
      )}
      <div className="mt-2.5 flex justify-end">
        <Button variant="primary" size="sm" loading={send.isPending} onClick={submit}>
          Send answer
        </Button>
      </div>
    </div>
  );
}

/** Questions raised by the investment team, with an answer form (and optional file) for each open question. */
export function QuestionsPanel({ questions }: { questions: QuestionView[] }) {
  const qc = useQueryClient();
  if (!questions.length) return null;
  const open = questions.filter((q) => q.status === 'OPEN').length;
  return (
    <Panel id="questions" className="scroll-mt-24">
      <PanelHeader
        title="Questions from the investment team"
        description={open ? `${open} question${open > 1 ? 's' : ''} need your answer before the pack can be accepted.` : 'All questions have been answered.'}
      />
      <PanelBody>
        <ul className="grid gap-3">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border border-border bg-surface px-3.5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-[12.5px] font-medium leading-relaxed">{q.question}</div>
                {q.status === 'OPEN' ? <StatusIndicator tone="warning">Awaiting your answer</StatusIndicator> : <StatusIndicator tone="success">{q.status === 'CLOSED' ? 'Closed' : 'Answered'}</StatusIndicator>}
              </div>
              <div className="num mt-1 text-[11px] text-muted-foreground">
                {q.raisedByName ?? 'Investment team'} · {formatDateTime(q.createdAt)}
                {sectionTitle(q.requirementKey) ? ` · ${sectionTitle(q.requirementKey)}` : ''}
              </div>
              {q.status !== 'OPEN' && q.answer && (
                <div className="mt-2.5 rounded-md border border-border-soft bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
                  <div>{q.answer}</div>
                  <div className="num mt-1 text-[11px] text-muted-foreground">
                    {q.answeredByName} · {formatDateTime(q.answeredAt)}
                  </div>
                  {q.attachments.map((a) => (
                    <a key={a.id} href={documentUrl(a.id)} className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-primary hover:underline">
                      <Paperclip className="size-3.5" /> {a.fileName}
                    </a>
                  ))}
                </div>
              )}
              {q.status === 'OPEN' && <AnswerForm q={q} onDone={() => void qc.invalidateQueries({ queryKey: ['company'] })} />}
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}
