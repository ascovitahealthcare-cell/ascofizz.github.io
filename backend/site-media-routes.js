/**
 * site-media-routes.js — Ascofizz
 * ─────────────────────────────────────────────────────────────────
 * Drop this into your Render backend repo and mount it, e.g. in
 * server.js / app.js:
 *
 *   const siteMediaRoutes = require('./site-media-routes');
 *   app.use('/api', siteMediaRoutes(supabase, requireAdmin));
 *
 * It assumes you already have (matching the patterns already in your
 * admin panel):
 *   - a Supabase client instance (`supabase`)
 *   - an Express auth middleware that checks the Bearer token used by
 *     `authToken` in admin.html and protects your existing
 *     /api/admin/* routes (`requireAdmin`)
 *   - the file upload middleware/route you already have at
 *     POST /api/upload/image (unchanged — this file does NOT touch
 *     uploading; it only stores which URL belongs to which spot on
 *     the site)
 *
 * Run the SQL in supabase-site-media.sql once before using this.
 * ─────────────────────────────────────────────────────────────────
 */

module.exports = function siteMediaRoutes(supabase, requireAdmin) {
  const express = require('express');
  const router = express.Router();

  /* ═══════════════════ SITE IMAGES (key → url map) ═══════════════════
     Covers the fixed, one-off image slots on the site: logo, home
     hero slides, about page photo + hero texture, b2b hero texture.
     The frontend already ships with the current live image
     hard-coded as a fallback, so a missing/empty table here is safe —
     the site just keeps showing what's already there. */

  // PUBLIC — storefront calls this on every page load
  router.get('/site-media', async (req, res) => {
    try {
      const { data, error } = await supabase.from('site_media').select('key,url');
      if (error) throw error;
      const map = {};
      (data || []).forEach(row => { map[row.key] = row.url; });
      res.json({ data: map });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — list with metadata (for the admin UI to show current values)
  router.get('/admin/site-media', requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase.from('site_media').select('*');
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — set/replace the image for one key. Body: { url: "..." }
  // Upload the file first via your existing POST /api/upload/image to
  // get a URL, then call this to point the key at it.
  router.put('/admin/site-media/:key', requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'url is required' });
      const { data, error } = await supabase
        .from('site_media')
        .upsert({ key, url, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select();
      if (error) throw error;
      res.json({ data: data && data[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — remove an override, reverting the site to its built-in default image
  router.delete('/admin/site-media/:key', requireAdmin, async (req, res) => {
    try {
      const { error } = await supabase.from('site_media').delete().eq('key', req.params.key);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ═══════════════════ PROMO CAROUSEL CARDS ═══════════════════
     Replaces the manual "edit PROMO_MEDIA.js and git push" workflow.
     PROMO_MEDIA.js stays in the repo as an offline fallback only —
     the storefront prefers whatever is in this table. */

  // PUBLIC — storefront carousel
  router.get('/promo-media', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('promo_media')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — full list including inactive, for the management grid
  router.get('/admin/promo-media', requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('promo_media')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      res.json({ data: data || [] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — add a card. Body: { src, type, poster, cta_page }
  router.post('/admin/promo-media', requireAdmin, async (req, res) => {
    try {
      const { src, type, poster, cta_page } = req.body;
      if (!src) return res.status(400).json({ error: 'src is required' });
      const { data: maxRow } = await supabase
        .from('promo_media').select('sort_order').order('sort_order', { ascending: false }).limit(1);
      const nextOrder = (maxRow && maxRow[0] ? maxRow[0].sort_order : 0) + 1;
      const { data, error } = await supabase
        .from('promo_media')
        .insert({ src, type: type || 'image', poster: poster || null, cta_page: cta_page || 'shop', sort_order: nextOrder, active: true })
        .select();
      if (error) throw error;
      res.json({ data: data && data[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — edit a card (swap image, change destination, toggle active, reorder)
  router.put('/admin/promo-media/:id', requireAdmin, async (req, res) => {
    try {
      const allowed = ['src', 'type', 'poster', 'cta_page', 'active', 'sort_order'];
      const body = {};
      allowed.forEach(k => { if (req.body[k] !== undefined) body[k] = req.body[k]; });
      const { data, error } = await supabase
        .from('promo_media').update(body).eq('id', req.params.id).select();
      if (error) throw error;
      res.json({ data: data && data[0] });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ADMIN — remove a card
  router.delete('/admin/promo-media/:id', requireAdmin, async (req, res) => {
    try {
      const { error } = await supabase.from('promo_media').delete().eq('id', req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
