import { DOCUMENT } from '@angular/common';
import { Injectable, LOCALE_ID, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

export const PUBLIC_SITE_ROOT = 'https://agent-orchestrator.dev/chat/';

export interface AlternateLanguageLink {
  readonly href: string;
  readonly hreflang: 'de' | 'en';
  readonly lang: 'de' | 'en';
  readonly label: 'Deutsch' | 'English';
}

@Injectable({ providedIn: 'root' })
export class WebsiteSeoService {
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LOCALE_ID);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  readonly isGerman = this.locale.toLowerCase().startsWith('de');
  readonly alternateLanguage: AlternateLanguageLink = this.isGerman
    ? { href: '../', hreflang: 'en', lang: 'en', label: 'English' }
    : { href: 'de/', hreflang: 'de', lang: 'de', label: 'Deutsch' };
  readonly legalPrefix = this.isGerman ? '../' : '';

  apply(): void {
    const locale = this.isGerman ? 'de' : 'en';
    const url = this.isGerman ? `${PUBLIC_SITE_ROOT}de/` : PUBLIC_SITE_ROOT;
    const imageUrl = `${PUBLIC_SITE_ROOT}${this.isGerman ? 'og-card-de.png' : 'og-card.png'}`;
    const pageTitle = $localize`:@@seoTitle:coding-agent-chat | Angular chat UI for coding agents`;
    const description = $localize`:@@seoDescription:Angular chat UI for coding agents. Render messages, tool calls, waits, decisions, code, images, and reusable conversation history components.`;
    const socialTitle = $localize`:@@seoSocialTitle:coding-agent-chat | Angular components for coding agents`;
    const socialDescription = $localize`:@@seoSocialDescription:Render coding-agent event streams as conversations with tool activity, decisions, code, images, history, and a composable input surface.`;
    const imageAlt = $localize`:@@seoImageAlt:coding-agent-chat conversation UI with tool activity, code, and run status`;

    this.document.documentElement.lang = locale;
    this.title.setTitle(pageTitle);

    this.setName('description', description);
    this.setName('author', 'Robert Mischke');
    this.setName('robots', 'index, follow');
    this.setName('twitter:card', 'summary_large_image');
    this.setName('twitter:title', socialTitle);
    this.setName('twitter:description', socialDescription);
    this.setName('twitter:image', imageUrl);
    this.setName('twitter:image:alt', imageAlt);

    this.setProperty('og:type', 'website');
    this.setProperty('og:site_name', 'coding-agent-chat');
    this.setProperty('og:title', socialTitle);
    this.setProperty('og:description', socialDescription);
    this.setProperty('og:url', url);
    this.setProperty('og:locale', this.isGerman ? 'de_DE' : 'en_US');
    this.setProperty('og:locale:alternate', this.isGerman ? 'en_US' : 'de_DE');
    this.setProperty('og:image', imageUrl);
    this.setProperty('og:image:type', 'image/png');
    this.setProperty('og:image:width', '1200');
    this.setProperty('og:image:height', '630');
    this.setProperty('og:image:alt', imageAlt);

    this.setLink('canonical', url);
    this.setLink('alternate', PUBLIC_SITE_ROOT, 'en');
    this.setLink('alternate', `${PUBLIC_SITE_ROOT}de/`, 'de');
    this.setLink('alternate', PUBLIC_SITE_ROOT, 'x-default');
    this.setStructuredData(locale, url, pageTitle, description);
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content }, `name='${name}'`);
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property='${property}'`);
  }

  private setLink(rel: string, href: string, hreflang?: string): void {
    const selector = hreflang
      ? `link[rel="${rel}"][hreflang="${hreflang}"]`
      : `link[rel="${rel}"]:not([hreflang])`;
    let link = this.document.head.querySelector<HTMLLinkElement>(selector);
    if (!link) {
      link = this.document.createElement('link');
      link.rel = rel;
      this.document.head.appendChild(link);
    }
    link.href = href;
    if (hreflang) link.hreflang = hreflang;
  }

  private setStructuredData(
    locale: 'de' | 'en',
    url: string,
    pageTitle: string,
    description: string,
  ): void {
    const id = 'coding-agent-chat-structured-data';
    let script = this.document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    const websiteId = 'https://agent-orchestrator.dev/#website';
    const softwareId = `${PUBLIC_SITE_ROOT}#software`;
    script.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': websiteId,
          name: 'Agent Orchestrator',
          url: 'https://agent-orchestrator.dev/',
        },
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          name: pageTitle,
          description,
          url,
          inLanguage: locale,
          isPartOf: { '@id': websiteId },
          mainEntity: { '@id': softwareId },
        },
        {
          '@type': 'SoftwareSourceCode',
          '@id': softwareId,
          name: 'coding-agent-chat',
          url: PUBLIC_SITE_ROOT,
          codeRepository: 'https://github.com/agent-orc/chat',
          sameAs: [
            'https://github.com/agent-orc/chat',
            'https://www.npmjs.com/package/coding-agent-chat',
          ],
          programmingLanguage: 'TypeScript',
          runtimePlatform: 'Angular 21',
          license: 'https://www.apache.org/licenses/LICENSE-2.0',
          author: { '@type': 'Person', name: 'Robert Mischke' },
          isPartOf: { '@id': websiteId },
        },
      ],
    });
  }
}
