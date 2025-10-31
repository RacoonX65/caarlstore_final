import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { WishlistButton } from "@/components/wishlist-button"

interface ProductCardProps {
  id?: string
  name?: string
  price?: number
  image_url?: string
  category?: string
  product?: {
    id: string
    name: string
    price: number
    image_url: string
    category: string
  }
}

export function ProductCard({ id, name, price, image_url, category, product }: ProductCardProps) {
  // Use product object if provided, otherwise use individual props
  const productData = product || { id, name, price, image_url, category }
  
  // Ensure price is a valid number
  const displayPrice = typeof productData.price === 'number' ? productData.price : 0

  return (
    <Card className="group overflow-hidden border-border shadow-sm hover:shadow-lg active:shadow-xl transition-shadow duration-300 relative min-h-[320px] touch-manipulation">
      <CardContent className="p-0">
        <Link href={`/products/${productData.id}`}>
          <div className="aspect-[3/4] relative overflow-hidden bg-muted">
            <Image
              src={productData.image_url || `/placeholder.svg?height=600&width=450&query=${encodeURIComponent(productData.name || 'Product')}`}
              alt={productData.name || 'Product'}
              fill
              className="object-contain group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
            />
          </div>
          <div className="p-4 space-y-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{productData.category}</p>
            <h3 className="font-medium text-sm line-clamp-2">{productData.name}</h3>
            <p className="text-lg font-semibold">R {displayPrice.toFixed(2)}</p>
          </div>
        </Link>
        <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <WishlistButton productId={productData.id || ''} />
        </div>
      </CardContent>
    </Card>
  )
}
