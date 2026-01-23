export function Logomark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-purple to-brand-purple-dark flex items-center justify-center shadow-sm">
        <span className="text-xl">🐝</span>
      </div>
      <span className="text-xl font-bold text-text-primary">Almanac</span>
    </div>
  );
}
