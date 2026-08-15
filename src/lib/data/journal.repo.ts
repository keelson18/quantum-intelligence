// Data-access tier: trading journal entries.
import { supabase } from '../supabase';

export interface JournalEntryInput {
  symbol: string;
  title: string;
  notes: string;
  lessons_learned: string;
  tags: string[];
  mood: string;
  trade_id: string | null;
}

export async function listJournalEntries<T>(): Promise<T[]> {
  const { data } = await supabase.from('journal_entries').select('*').order('created_at', { ascending: false });
  return (data ?? []) as T[];
}

export async function createJournalEntry(row: JournalEntryInput): Promise<void> {
  await supabase.from('journal_entries').insert(row);
}

export async function updateJournalEntry(id: string, row: JournalEntryInput): Promise<void> {
  await supabase.from('journal_entries').update(row).eq('id', id);
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await supabase.from('journal_entries').delete().eq('id', id);
}
