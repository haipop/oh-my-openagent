import type { JSX } from "react"
import { getTranslations } from "next-intl/server"

import { Icon } from "@/components/home/icons"
import { Link } from "@/i18n/routing"

export async function ClosingSection(): Promise<JSX.Element> {
  const t = await getTranslations("home.closing")

  return (
    <section data-section="install" className="closing" aria-labelledby="closing-title">
      <div className="wrap closing__inner">
        <h2 id="closing-title" className="h2 rise">
          {t("title")} <span className="soft">{t("soft")}</span>
        </h2>
        <p className="section__lede rise">{t("body")}</p>
        <div className="cta-row rise">
          <Link className="btn btn--primary" href="/docs/install">
            {t("docs")}
          </Link>
          <Link className="btn btn--ghost" href="/manifesto">
            {t("manifesto")} <Icon name="arrow" className="arrow" />
          </Link>
        </div>
      </div>
    </section>
  )
}
