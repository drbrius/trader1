/**
 * Photography used on the marketing sections.
 *
 * All images come from Unsplash and are served straight from their CDN with
 * imgix parameters, so we ship no binaries and the right size is delivered per
 * slot. The Unsplash License permits commercial use without attribution; we
 * credit the photographers in the footer anyway.
 */

export interface Photo {
  /** CDN url, sized for the slot it fills. */
  src: string;
  alt: string;
  photographer: string;
  /** Source page, linked from the credits line. */
  href: string;
}

const cdn = (id: string, width: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&q=60&w=${width}`;

export const HERO_PHOTO: Photo = {
  src: cdn('photo-1611974789855-9c2a0a7236a3', 1600),
  alt: 'Kerzenchart mit gleitenden Durchschnitten auf einem dunklen Bildschirm',
  photographer: 'Maxim Hopman',
  href: 'https://unsplash.com/photos/stock-market-candlestick-chart-on-dark-screen-fiXLQXAhCfk',
};

export const ANNOTATE_PHOTO: Photo = {
  src: cdn('photo-1768055105681-7d2096c5165f', 800),
  alt: 'Trader markiert von Hand Zonen auf einem Chart am Tablet',
  photographer: 'Jakub Żerdzicki',
  href: 'https://unsplash.com/photos/trader-analyzing-stock-market-charts-on-multiple-screens-j_hho1mE47s',
};

export const TABLET_PHOTO: Photo = {
  src: cdn('photo-1767424412548-1a1ac7f4b9bc', 800),
  alt: 'Chart mit Kerzen und gleitenden Durchschnitten auf einem Tablet neben Notizen',
  photographer: 'Jakub Żerdzicki',
  href: 'https://unsplash.com/photos/trading-charts-displayed-on-multiple-screens-and-tablet-vKNRKjSNbTo',
};

/** Unique photographers, for the one credits line in the footer. */
export const PHOTO_CREDITS: Photo[] = [HERO_PHOTO, ANNOTATE_PHOTO].filter(
  (photo, index, all) => all.findIndex((p) => p.photographer === photo.photographer) === index,
);
