import React from 'react';

interface RawMarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

export const RawMarkdownEditor: React.FC<RawMarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write raw markdown source...',
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange(newValue);

      // Restore cursor position
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full flex-1 min-h-[350px] bg-transparent text-slate-200 font-mono text-sm leading-relaxed placeholder:text-slate-600 focus:outline-none resize-none"
      />
    </div>
  );
};
