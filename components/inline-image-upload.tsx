"use client"

import React, { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { X, Upload, Image as ImageIcon } from "lucide-react"

interface InlineImageUploadProps {
  onUploadComplete: (urls: string[]) => void
  existingImages?: string[]
  maxFiles?: number
}

export function InlineImageUpload({ 
  onUploadComplete, 
  existingImages = [], 
  maxFiles = 10 
}: InlineImageUploadProps) {
  const [images, setImages] = useState<string[]>(existingImages)
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [previewImages, setPreviewImages] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '')
    
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    )
    
    if (!response.ok) {
      throw new Error('Upload failed')
    }
    
    const data = await response.json()
    return data.secure_url
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    const fileArray = Array.from(files)
    const remainingSlots = maxFiles - images.length
    const filesToProcess = fileArray.slice(0, remainingSlots)
    
    // Create preview URLs for immediate display
    const newPreviewUrls = filesToProcess.map(file => URL.createObjectURL(file))
    setPreviewImages(prev => [...prev, ...newPreviewUrls])
    
    setIsUploading(true)
    
    try {
      const uploadPromises = filesToProcess.map(uploadToCloudinary)
      const uploadedUrls = await Promise.all(uploadPromises)
      
      const newImages = [...images, ...uploadedUrls]
      setImages(newImages)
      onUploadComplete(newImages)
      
      // Clear preview URLs after successful upload
      newPreviewUrls.forEach(url => URL.revokeObjectURL(url))
      setPreviewImages(prev => prev.filter(url => !newPreviewUrls.includes(url)))
    } catch (error) {
      console.error('Upload error:', error)
      // Clear preview URLs on error
      newPreviewUrls.forEach(url => URL.revokeObjectURL(url))
      setPreviewImages(prev => prev.filter(url => !newPreviewUrls.includes(url)))
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index)
    setImages(newImages)
    onUploadComplete(newImages)
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      <Label>Product Images</Label>
      
      {/* Upload Area */}
      <Card 
        className={`border-2 border-dashed transition-colors ${
          dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
        }`}
      >
        <CardContent className="p-6">
          <div
            className="text-center cursor-pointer"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={openFileDialog}
          >
            <div className="mx-auto w-12 h-12 mb-4 flex items-center justify-center rounded-full bg-muted">
              <Upload className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium mb-2">
              {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, GIF up to 10MB each (max {maxFiles} files)
            </p>
          </div>
          
          <Input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* Image Preview Grid */}
      {(images.length > 0 || previewImages.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {/* Uploaded Images */}
          {images.map((url, index) => (
            <div key={index} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                <img
                  src={url}
                  alt={`Product image ${index + 1}`}
                  className="w-full h-full object-contain"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute -top-2 -right-2 w-8 h-8 rounded-full p-0 opacity-0 group-hover:opacity-100 transition-opacity min-h-[32px] min-w-[32px] touch-manipulation"
                onClick={() => removeImage(index)}
              >
                <X className="w-4 h-4" />
              </Button>
              {index === 0 && previewImages.length === 0 && (
                <div className="absolute bottom-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                  Main
                </div>
              )}
            </div>
          ))}
          
          {/* Preview Images (uploading) */}
          {previewImages.map((previewUrl, index) => (
            <div key={previewUrl} className="relative group">
              <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                <img
                  src={previewUrl}
                  alt={`Preview image ${index + 1}`}
                  className="w-full h-full object-contain opacity-75"
                />
                {index === 0 && images.length === 0 && (
                  <div className="absolute bottom-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                    Main
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="bg-white/90 px-2 py-1 rounded text-xs font-medium text-black">
                    Uploading...
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {images.length} image{images.length !== 1 ? 's' : ''} uploaded. 
          The first image will be used as the main product image.
        </p>
      )}
    </div>
  )
}