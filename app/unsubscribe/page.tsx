export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>
}) {
  const { success } = await searchParams
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-xl font-semibold">
          {success ? "You've been unsubscribed" : 'Unsubscribe'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {success
            ? "You won't receive any more emails."
            : 'Invalid or expired unsubscribe link.'}
        </p>
      </div>
    </div>
  )
}
