export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 bg-[#F2F4F3]/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-[#1F555C] to-[#E6E8E6] rounded-full transition-all duration-300"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
