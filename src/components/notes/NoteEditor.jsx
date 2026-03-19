import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';

export default function NoteEditor({ note, onSave, onDelete }) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const initialNote = useRef(note);
    const saveTimeoutRef = useRef(null);

    useEffect(() => {
        if (note) {
            setTitle(note.title);
            setContent(note.content);
            initialNote.current = note;
        }
    }, [note]);

    // Simple debounce function
    const debouncedSave = (updatedNote) => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
            onSave(updatedNote);
        }, 500);
    };

    useEffect(() => {
        if (note && (title !== initialNote.current.title || content !== initialNote.current.content)) {
            debouncedSave({ ...note, title, content });
        }
        
        // Cleanup timeout on unmount
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [title, content, note]);

    if (!note) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-slate-400">
                <p>Select a note to view or create a new one.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-gray-50 dark:bg-slate-900">
            <div className="p-4 border-b border-gray-200 dark:border-slate-700 flex justify-end">
                <Button variant="ghost" size="icon" onClick={() => onDelete(note.id)} className="hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Delete note">
                    <Trash2 className="w-5 h-5 text-red-500 dark:text-red-400" />
                </Button>
            </div>
            <div className="p-8 flex-1">
                <label htmlFor="note-editor-title" className="sr-only">Note title</label>
                <Input
                    id="note-editor-title"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Title"
                    className="text-3xl font-bold border-none shadow-none focus-visible:ring-0 p-0 mb-4 bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
                <label htmlFor="note-editor-content" className="sr-only">Note content</label>
                <textarea
                    id="note-editor-content"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    placeholder="Start writing..."
                    className="w-full h-full text-lg border-none shadow-none focus:outline-none p-0 resize-none bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                />
            </div>
        </div>
    );
}