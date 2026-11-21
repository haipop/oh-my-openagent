import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { redirect } from "next/navigation"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: "docs.install" })
  return { title: t("title"), description: t("description") }
}

export default function InstallDocsPage(): never {
  redirect("https://github.com/haipop/oh-my-openagent/blob/feat/deepseek-harness/README.md")
}
