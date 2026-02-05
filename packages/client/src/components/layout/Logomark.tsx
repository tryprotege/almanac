export function Logomark({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <img src="/Almanac.svg" alt="Almanac" className="w-8 h-8" />
      <span className="text-xl font-bold text-text-primary">Almanac</span>
    </div>
  );
}
