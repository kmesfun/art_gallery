import "./styles.css";
import { pb } from "./pocketbase";

const ARTWORK_COLLECTION = import.meta.env.VITE_ARTWORK_COLLECTION ?? "artworks";
const ORDERS_COLLECTION = import.meta.env.VITE_ORDERS_COLLECTION ?? "orders";

const SIZE_MULTIPLIERS = {
  "8x10": 1,
  "11x17": 1.45,
  "20x24": 2.2,
} as const;

type PrintSize = keyof typeof SIZE_MULTIPLIERS;

interface ArtworkRecord {
  id: string;
  title: string;
  imageUrl?: string;
  imageFile?: string;
  description?: string;
  basePrice: number;
}

interface Artwork {
  id: string;
  title: string;
  imageUrl: string;
  description: string;
  basePrice: number;
}

interface CartItem {
  artId: string;
  title: string;
  size: PrintSize;
  unitPrice: number;
}

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing gallery element: #${id}`);
  }
  return el as T;
}

const galleryCatalog = getEl<HTMLDivElement>("gallery-catalog");
const galleryStatus = getEl<HTMLParagraphElement>("gallery-status");
const refreshButton = getEl<HTMLButtonElement>("refresh-btn");
const openCartBtn = getEl<HTMLButtonElement>("open-cart-btn");
const closeCartBtn = getEl<HTMLButtonElement>("close-cart-btn");
const cartDialog = getEl<HTMLDialogElement>("cart-dialog");
const cartItems = getEl<HTMLDivElement>("cart-items");
const cartTotal = getEl<HTMLElement>("cart-total");
const cartCount = getEl<HTMLElement>("cart-count");
const checkoutForm = getEl<HTMLFormElement>("checkout-form");
const successDialog = getEl<HTMLDialogElement>("success-dialog");
const orderMessage = getEl<HTMLParagraphElement>("order-message");
const closeSuccessBtn = getEl<HTMLButtonElement>("close-success-btn");

let cart: CartItem[] = [];

refreshButton.addEventListener("click", () => {
  void loadAndRenderArtworks();
});

openCartBtn.addEventListener("click", () => cartDialog.showModal());
closeCartBtn.addEventListener("click", () => cartDialog.close());
closeSuccessBtn.addEventListener("click", () => successDialog.close());

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cart.length) {
    alert("Your cart is empty.");
    return;
  }

  const buyerName = getEl<HTMLInputElement>("buyerName").value.trim();
  const buyerEmail = getEl<HTMLInputElement>("buyerEmail").value.trim();
  const shippingAddress = getEl<HTMLTextAreaElement>("shippingAddress").value.trim();
  const total = calculateTotal();

  try {
    const orderRecord = await pb.collection(ORDERS_COLLECTION).create({
      buyerName,
      buyerEmail,
      shippingAddress,
      items: cart,
      total,
    });

    orderMessage.textContent = `Order ${orderRecord.id} submitted. Total: ${formatMoney(total)}.`;

    cart = [];
    checkoutForm.reset();
    renderCart();
    cartDialog.close();
    successDialog.showModal();
  } catch (error) {
    console.error(error);
    alert(`Could not place order: ${readPocketBaseError(error)}`);
  }
});

void loadAndRenderArtworks();
renderCart();

async function loadAndRenderArtworks(): Promise<void> {
  galleryStatus.textContent = "Loading artworks...";

  try {
    const records = await pb.collection(ARTWORK_COLLECTION).getFullList<ArtworkRecord>({
      sort: "-createdAt",
    });

    const artworks = records.map((record) => ({
      id: record.id,
      title: record.title,
      imageUrl: resolveArtworkImage(record),
      description: record.description ?? "Original artwork",
      basePrice: record.basePrice,
    }));

    renderGallery(artworks);
  } catch (error) {
    console.error(error);
    galleryCatalog.innerHTML = "";
    galleryStatus.textContent =
      `Could not load gallery from "${ARTWORK_COLLECTION}": ${readPocketBaseError(error)}`;
  }
}

function resolveArtworkImage(record: ArtworkRecord): string {
  if (record.imageFile) {
    return pb.files.getURL(record as unknown as { [key: string]: unknown }, record.imageFile);
  }

  return record.imageUrl ?? "";
}

function renderGallery(artworks: Artwork[]): void {
  galleryCatalog.innerHTML = "";

  if (artworks.length === 0) {
    galleryStatus.textContent = "No artworks found yet.";
    return;
  }

  galleryStatus.textContent = `${artworks.length} artwork${artworks.length === 1 ? "" : "s"} found.`;

  artworks.forEach((art) => {
    const card = document.createElement("article");
    card.className = "art-card";

    const sizeOptions = (Object.keys(SIZE_MULTIPLIERS) as PrintSize[])
      .map((size) => `<option value="${size}">${size}</option>`)
      .join("");

    card.innerHTML = `
      <img class="art-image" src="${escapeHtml(art.imageUrl)}" alt="${escapeHtml(art.title)}" loading="lazy" />
      <div class="art-body">
        <h3>${escapeHtml(art.title)}</h3>
        <p>${escapeHtml(art.description)}</p>
        <div class="size-row">
          <label for="size-${art.id}">Size</label>
          <select id="size-${art.id}">
            ${sizeOptions}
          </select>
        </div>
        <div class="price-row">
          <span class="price" id="price-${art.id}">${formatMoney(art.basePrice)}</span>
          <button class="btn" type="button" data-add-id="${art.id}">Add To Cart</button>
        </div>
      </div>
    `;

    const sizeSelect = card.querySelector(`#size-${CSS.escape(art.id)}`) as HTMLSelectElement | null;
    const priceTag = card.querySelector(`#price-${CSS.escape(art.id)}`) as HTMLElement | null;
    const addButton = card.querySelector("[data-add-id]") as HTMLButtonElement | null;

    if (!sizeSelect || !priceTag || !addButton) {
      return;
    }

    sizeSelect.addEventListener("change", () => {
      const size = sizeSelect.value as PrintSize;
      priceTag.textContent = formatMoney(sizePrice(art.basePrice, size));
    });

    addButton.addEventListener("click", () => {
      const size = sizeSelect.value as PrintSize;
      cart.push({
        artId: art.id,
        title: art.title,
        size,
        unitPrice: sizePrice(art.basePrice, size),
      });
      renderCart();
    });

    galleryCatalog.appendChild(card);
  });
}

function renderCart(): void {
  cartItems.innerHTML = "";

  if (!cart.length) {
    cartItems.innerHTML = '<p class="cart-item-meta">No items yet.</p>';
  }

  const grouped = new Map<
    string,
    { item: CartItem; quantity: number; firstIndex: number }
  >();

  cart.forEach((item, index) => {
    const key = `${item.artId}__${item.size}__${item.unitPrice}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
      return;
    }
    grouped.set(key, { item, quantity: 1, firstIndex: index });
  });

  Array.from(grouped.values()).forEach((group) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    const lineTotal = group.item.unitPrice * group.quantity;

    row.innerHTML = `
      <span class="cart-item-title">${group.quantity}x ${escapeHtml(group.item.title)}</span>
      <strong>${formatMoney(lineTotal)}</strong>
      <span class="cart-item-meta">${group.item.size}</span>
      <button class="text-btn" type="button" data-remove-index="${group.firstIndex}">Remove</button>
    `;

    const removeButton = row.querySelector("[data-remove-index]") as HTMLButtonElement | null;
    if (removeButton) {
      removeButton.addEventListener("click", () => {
        cart.splice(group.firstIndex, 1);
        renderCart();
      });
    }

    cartItems.appendChild(row);
  });

  cartTotal.textContent = formatMoney(calculateTotal());
  cartCount.textContent = String(cart.length);
}

function sizePrice(basePrice: number, size: PrintSize): number {
  return Math.round(basePrice * SIZE_MULTIPLIERS[size] * 100) / 100;
}

function calculateTotal(): number {
  return cart.reduce((sum, item) => sum + item.unitPrice, 0);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readPocketBaseError(error: unknown): string {
  if (error && typeof error === "object") {
    const maybeError = error as {
      message?: string;
      response?: { message?: string; data?: Record<string, { message?: string }> };
    };

    const fieldErrors = maybeError.response?.data
      ? Object.values(maybeError.response.data)
          .map((entry) => entry?.message)
          .filter((msg): msg is string => Boolean(msg))
      : [];

    if (fieldErrors.length > 0) {
      return fieldErrors.join("; ");
    }

    if (maybeError.response?.message) {
      return maybeError.response.message;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return "Unknown error";
}
