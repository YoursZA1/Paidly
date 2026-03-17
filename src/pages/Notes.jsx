import { useState, useEffect, useCallback, useMemo } from "react";
import debounce from "lodash.debounce";
import { Note } from "@/api/entities";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import {
  Plus,
  Search,
  Trash2,
  Star,
  Archive,
  ArrowLeft,
  FileEdit,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [saveStatus, setSaveStatus] = useState("Saved"); // 'Typing...' | 'Saving...' | 'Saved' | 'Error saving'
  const [showEditorOverlay, setShowEditorOverlay] = useState(false);
  const { toast } = useToast();

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await Note.list("-updated_date");
      setNotes(data || []);
    } catch (err) {
      console.error("Error loading notes:", err);
      toast({
        title: "Failed to load notes",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title || "");
      setEditContent(selectedNote.content || "");
      setSaveStatus("Saved");
    }
  }, [selectedNote]);

  const saveToDatabase = useCallback(
    async (title, content) => {
      if (!selectedNote?.id) return;
      setSaveStatus("Saving...");
      try {
        await Note.update(selectedNote.id, {
          title,
          content,
          is_pinned: selectedNote.is_pinned,
        });
        const updated = { ...selectedNote, title, content };
        setSelectedNote((prev) => (prev?.id === selectedNote.id ? updated : prev));
        setNotes((prev) =>
          prev.map((n) => (n.id === selectedNote.id ? { ...n, title, content } : n))
        );
        setSaveStatus("Saved");
      } catch (err) {
        console.error("Error saving note:", err);
        setSaveStatus("Error saving");
        toast({
          title: "Failed to save",
          description: err?.message || "Please try again.",
          variant: "destructive",
        });
      }
    },
    // selectedNote required for in-memory update; debouncer recreated when note changes
    [selectedNote, toast]
  );

  const debouncedSave = useMemo(
    () => debounce((title, content) => saveToDatabase(title, content), 2000),
    [saveToDatabase]
  );

  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  useEffect(() => {
    if (!selectedNote?.id) return;
    debouncedSave.cancel();
    setSaveStatus("Saved");
  }, [selectedNote?.id, debouncedSave]);

  const handleTitleChange = (e) => {
    const value = e.target.value;
    setEditTitle(value);
    setSaveStatus("Typing...");
    debouncedSave(value, editContent);
  };

  const handleContentChange = (e) => {
    const value = e.target.value;
    setEditContent(value);
    setSaveStatus("Typing...");
    debouncedSave(editTitle, value);
  };

  const handleNewNote = async () => {
    try {
      const newNote = await Note.create({ title: "New Note", content: "" });
      await loadNotes();
      setSelectedNote(newNote);
      setEditTitle("New Note");
      setEditContent("");
      setShowEditorOverlay(true);
    } catch (err) {
      console.error("Error creating note:", err);
      toast({
        title: "Failed to create note",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSelectNote = (note) => {
    setSelectedNote(note);
    setShowEditorOverlay(true);
  };

  const handleBack = () => {
    setShowEditorOverlay(false);
  };

  const handleDeleteNote = async () => {
    if (!selectedNote?.id) return;
    try {
      await Note.delete(selectedNote.id);
      await loadNotes();
      setSelectedNote(null);
      setShowEditorOverlay(false);
      toast({ title: "Note deleted", variant: "default" });
    } catch (err) {
      console.error("Error deleting note:", err);
      toast({
        title: "Failed to delete",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handlePinNote = async (note) => {
    try {
      await Note.update(note.id, { is_pinned: !note.is_pinned });
      await loadNotes();
      if (selectedNote?.id === note.id) {
        setSelectedNote((prev) =>
          prev ? { ...prev, is_pinned: !note.is_pinned } : null
        );
      }
    } catch (err) {
      console.error("Error pinning note:", err);
      toast({
        title: "Failed to update",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const filteredNotes = notes.filter(
    (note) =>
      note.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const preview = (content) =>
    (content || "")
      .replace(/<[^>]*>/g, "")
      .substring(0, 80)
      .trim() || "No additional text";

  return (
    <div className="flex h-screen bg-[#F8FAFC] dark:bg-slate-900">
      {/* 1. Notes List Sidebar */}
      <aside
        className={`w-full lg:w-80 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col shrink-0 ${
          showEditorOverlay ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="p-6 border-b border-slate-100 dark:border-slate-700">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100">Notes</h1>
            <button
              onClick={handleNewNote}
              data-testid="notes-add"
              aria-label="Add note"
              className="p-2 bg-orange-500 rounded-xl text-white hover:bg-orange-600 transition-all shadow-lg shadow-orange-200 dark:shadow-orange-900/30"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="notes-search"
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-700/50 border-none rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-orange-500/20 dark:focus:ring-orange-500/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm">
              Loading...
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-sm">
              {searchQuery ? "No notes found" : "No notes yet. Tap + to create one."}
            </div>
          ) : (
            filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => handleSelectNote(note)}
                data-testid="note-row"
                className={`w-full text-left p-4 rounded-2xl transition-all ${
                  selectedNote?.id === note.id
                    ? "bg-orange-50 dark:bg-orange-950/50 ring-1 ring-orange-100 dark:ring-orange-800"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      selectedNote?.id === note.id
                        ? "text-orange-500 dark:text-orange-400"
                        : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {note.category || "General"}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                    {format(
                      new Date(note.updated_date || note.updated_at || note.created_at),
                      "MMM d"
                    )}
                  </span>
                </div>
                <h3
                  className={`font-bold text-sm mb-1 ${
                    selectedNote?.id === note.id
                      ? "text-slate-900 dark:text-slate-100"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {note.title || "Untitled"}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {preview(note.content)}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* 2. Main Editor Area - Desktop: always visible when note selected; Mobile: overlay */}
      <AnimatePresence mode="wait">
        {selectedNote ? (
          <motion.div
            key={selectedNote.id}
            initial={{ opacity: 0, x: "100%" }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            className={`flex-1 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col ${
              showEditorOverlay
                ? "fixed inset-0 z-50 lg:relative lg:z-auto"
                : "hidden lg:flex"
            }`}
          >
            {/* Mobile: Back button */}
            <div className="lg:hidden flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-600 dark:text-slate-400"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Back</span>
            </div>

            {/* Toolbar */}
            <div className="flex justify-between items-center px-6 lg:px-8 py-4 border-b border-slate-200 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm">
              <div className="flex gap-2">
                <button
                  onClick={() => handlePinNote(selectedNote)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 dark:text-slate-500"
                  title={selectedNote.is_pinned ? "Unpin" : "Pin"}
                >
                  <Star
                    className={`w-5 h-5 ${
                      selectedNote.is_pinned ? "fill-amber-400 text-amber-500 dark:fill-amber-500 dark:text-amber-400" : ""
                    }`}
                  />
                </button>
                <button
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 dark:text-slate-500"
                  title="Archive (coming soon)"
                >
                  <Archive className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 min-w-[4rem] text-right">
                  {saveStatus}
                </span>
                <button
                  onClick={handleDeleteNote}
                  data-testid="note-delete"
                  className="flex items-center gap-2 text-red-500 dark:text-red-400 text-sm font-bold px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>

            {/* Editor Canvas */}
            <div className="flex-1 p-6 lg:p-12 max-w-4xl mx-auto w-full overflow-auto">
              <input
                value={editTitle}
                onChange={handleTitleChange}
                data-testid="note-title"
                className="w-full text-4xl font-black text-slate-900 dark:text-slate-100 border-none bg-transparent focus:ring-0 mb-6 placeholder-slate-300 dark:placeholder-slate-500"
                placeholder="Title"
              />
              <textarea
                value={editContent}
                onChange={handleContentChange}
                data-testid="note-body"
                className="w-full min-h-[70vh] text-lg text-slate-600 dark:text-slate-300 border-none bg-transparent focus:ring-0 leading-relaxed resize-none placeholder-slate-400 dark:placeholder-slate-500"
                placeholder="Start typing your brilliant business ideas here..."
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="hidden lg:flex flex-1 flex-col items-center justify-center text-slate-400 dark:text-slate-500"
          >
            <FileEdit className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium">Select a note or create a new one to begin.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
