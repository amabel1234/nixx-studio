import { Router, type IRouter, type Request, type Response } from "express";
import {
  AdminLoginBody,
  CreateProductBody,
  GetProductParams,
  ListProductsQueryParams,
  UpdateProductBody,
  UpdateProductParams,
  UpdateSettingsBody,
} from "@workspace/api-zod";
import { createHmac, timingSafeEqual } from "node:crypto";
import { supabaseHeaders, supabaseRequest } from "../lib/supabase";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price: number;
  tagline: string;
  description: string;
  features: string[];
  image_url: string | null;
  status: "active" | "inactive";
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type SettingsRow = {
  id: number;
  brand_name: string;
  hero_title: string;
  hero_subtitle: string;
  whatsapp_number: string;
  telegram_url: string;
  discord_url: string;
  updated_at: string;
};

const router: IRouter = Router();
const SESSION_COOKIE = "nixx_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 8;

function jsonError(res: Response, status: number, error: string) {
  return res.status(status).json({ error });
}

function toProduct(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    price: row.price,
    tagline: row.tagline,
    description: row.description,
    features: row.features ?? [],
    imageUrl: row.image_url,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSettings(row: SettingsRow) {
  return {
    id: row.id,
    brandName: row.brand_name,
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    whatsappNumber: row.whatsapp_number,
    telegramUrl: row.telegram_url,
    discordUrl: row.discord_url,
    updatedAt: row.updated_at,
  };
}

function sessionSignature(value: string) {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "")
    .update(value)
    .digest("base64url");
}

function makeSession(email: string) {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }),
  ).toString("base64url");
  return `${payload}.${sessionSignature(payload)}`;
}

function getSession(req: Request): { email: string } | null {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  const expected = sessionSignature(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: string;
      exp?: number;
    };
    if (!parsed.email || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { email: parsed.email };
  } catch {
    return null;
  }
}

function requireAdmin(req: Request, res: Response): { email: string } | null {
  const session = getSession(req);
  if (!session) {
    jsonError(res, 401, "Admin authentication required");
    return null;
  }
  return session;
}

function supabaseProductPayload(body: Record<string, unknown>) {
  return {
    name: body.name,
    slug: body.slug,
    price: body.price,
    tagline: body.tagline,
    description: body.description,
    features: body.features,
    image_url: body.imageUrl ?? null,
    status: body.status,
    sort_order: body.sortOrder,
  };
}

router.get("/products", async (req, res) => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) return jsonError(res, 400, "Invalid query parameters");
  const includeInactive = parsed.data.includeInactive === true;
  if (includeInactive && !getSession(req)) {
    return jsonError(res, 401, "Admin authentication required");
  }
  const query = new URLSearchParams({
    select: "*",
    order: "sort_order.asc,created_at.asc",
  });
  if (!includeInactive) query.set("status", "eq.active");

  try {
    const rows = await supabaseRequest<ProductRow[]>(
      `/rest/v1/products?${query.toString()}`,
    );
    return res.json(rows.map(toProduct));
  } catch (error) {
    req.log.error({ err: error }, "Failed to list products");
    return jsonError(res, 503, "Database is not ready. Run supabase/schema.sql first.");
  }
});

router.get("/products/:id", async (req, res) => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) return jsonError(res, 400, "Invalid product id");
  try {
    const rows = await supabaseRequest<ProductRow[]>(
      `/rest/v1/products?id=eq.${encodeURIComponent(parsed.data.id)}&select=*`,
    );
    if (!rows[0]) return jsonError(res, 404, "Product not found");
    if (rows[0].status === "inactive" && !getSession(req)) {
      return jsonError(res, 404, "Product not found");
    }
    return res.json(toProduct(rows[0]));
  } catch (error) {
    req.log.error({ err: error }, "Failed to get product");
    return jsonError(res, 503, "Database is not ready. Run supabase/schema.sql first.");
  }
});

router.post("/products", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) return jsonError(res, 400, "Invalid product data");
  try {
    const rows = await supabaseRequest<ProductRow[]>("/rest/v1/products", {
      method: "POST",
      headers: supabaseHeaders,
      body: JSON.stringify(supabaseProductPayload(parsed.data)),
    });
    return res.status(201).json(toProduct(rows[0]));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create product");
    return jsonError(res, 400, "Unable to create product");
  }
});

router.patch("/products/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const idParsed = UpdateProductParams.safeParse(req.params);
  const bodyParsed = UpdateProductBody.safeParse(req.body);
  if (!idParsed.success || !bodyParsed.success) {
    return jsonError(res, 400, "Invalid product data");
  }
  const patch = supabaseProductPayload(bodyParsed.data as Record<string, unknown>);
  Object.keys(patch).forEach((key) => {
    if (patch[key as keyof typeof patch] === undefined) {
      delete patch[key as keyof typeof patch];
    }
  });
  try {
    const rows = await supabaseRequest<ProductRow[]>(
      `/rest/v1/products?id=eq.${encodeURIComponent(idParsed.data.id)}`,
      {
        method: "PATCH",
        headers: supabaseHeaders,
        body: JSON.stringify(patch),
      },
    );
    if (!rows[0]) return jsonError(res, 404, "Product not found");
    return res.json(toProduct(rows[0]));
  } catch (error) {
    req.log.error({ err: error }, "Failed to update product");
    return jsonError(res, 400, "Unable to update product");
  }
});

router.delete("/products/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) return jsonError(res, 400, "Invalid product id");
  try {
    await supabaseRequest(
      `/rest/v1/products?id=eq.${encodeURIComponent(parsed.data.id)}`,
      { method: "DELETE", headers: supabaseHeaders },
    );
    return res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Failed to delete product");
    return jsonError(res, 400, "Unable to delete product");
  }
});

router.get("/settings", async (req, res) => {
  try {
    const rows = await supabaseRequest<SettingsRow[]>(
      "/rest/v1/site_settings?id=eq.1&select=*",
    );
    if (!rows[0]) return jsonError(res, 503, "Site settings are not configured");
    return res.json(toSettings(rows[0]));
  } catch (error) {
    req.log.error({ err: error }, "Failed to get settings");
    return jsonError(res, 503, "Database is not ready. Run supabase/schema.sql first.");
  }
});

router.patch("/settings", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) return jsonError(res, 400, "Invalid settings data");
  const patch = {
    brand_name: parsed.data.brandName,
    hero_title: parsed.data.heroTitle,
    hero_subtitle: parsed.data.heroSubtitle,
    whatsapp_number: parsed.data.whatsappNumber,
    telegram_url: parsed.data.telegramUrl,
    discord_url: parsed.data.discordUrl,
  };
  Object.keys(patch).forEach((key) => {
    if (patch[key as keyof typeof patch] === undefined) {
      delete patch[key as keyof typeof patch];
    }
  });
  try {
    const rows = await supabaseRequest<SettingsRow[]>(
      "/rest/v1/site_settings?id=eq.1",
      { method: "PATCH", headers: supabaseHeaders, body: JSON.stringify(patch) },
    );
    if (!rows[0]) return jsonError(res, 404, "Site settings not found");
    return res.json(toSettings(rows[0]));
  } catch (error) {
    req.log.error({ err: error }, "Failed to update settings");
    return jsonError(res, 400, "Unable to update settings");
  }
});

router.post("/admin/login", (req, res) => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) return jsonError(res, 400, "Email and password are required");
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || parsed.data.email !== email || parsed.data.password !== password) {
    return jsonError(res, 401, "Invalid admin credentials");
  }
  res.cookie(SESSION_COOKIE, makeSession(email), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE * 1000,
    path: "/",
  });
  return res.json({ authenticated: true, email });
});

router.post("/admin/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
  return res.status(204).send();
});

router.get("/admin/session", (req, res) => {
  const session = getSession(req);
  if (!session) return jsonError(res, 401, "Admin authentication required");
  return res.json({ authenticated: true, email: session.email });
});

router.get("/admin/summary", async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const rows = await supabaseRequest<ProductRow[]>(
      "/rest/v1/products?select=price,status",
    );
    const prices = rows.map((row) => row.price);
    return res.json({
      totalProducts: rows.length,
      activeProducts: rows.filter((row) => row.status === "active").length,
      inactiveProducts: rows.filter((row) => row.status === "inactive").length,
      lowestPrice: prices.length ? Math.min(...prices) : 0,
      highestPrice: prices.length ? Math.max(...prices) : 0,
    });
  } catch (error) {
    req.log.error({ err: error }, "Failed to get admin summary");
    return jsonError(res, 503, "Database is not ready. Run supabase/schema.sql first.");
  }
});

export default router;