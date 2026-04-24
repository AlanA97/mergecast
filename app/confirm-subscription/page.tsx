import Link from 'next/link'

export default async function ConfirmSubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-4xl">✓</div>
        <h1 className="text-xl font-semibold">You&apos;re subscribed!</h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ll receive emails when new updates are published.
        </p>
        {slug && (
          <Link href={`/${slug}`} className="text-sm underline">
            View changelog
          </Link>
        )}
      </div>
    </div>
  )
}
