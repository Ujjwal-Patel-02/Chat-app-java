/** Animated aurora gradient blobs behind the glass UI. Purely decorative. */
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden="true">
      <span className="aurora-blob b1" />
      <span className="aurora-blob b2" />
      <span className="aurora-blob b3" />
      <span className="aurora-blob b4" />
      <span className="aurora-grid" />
    </div>
  )
}
