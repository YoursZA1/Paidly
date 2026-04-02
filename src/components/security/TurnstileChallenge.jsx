export default function TurnstileChallenge({
  siteKey,
  required,
  ready,
  containerRef,
  helperClassName = "text-xs text-muted-foreground",
}) {
  if (!siteKey) return null;

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="min-h-[65px]" />
      {required && !ready ? (
        <p className={helperClassName}>Complete the security check to continue.</p>
      ) : null}
    </div>
  );
}
