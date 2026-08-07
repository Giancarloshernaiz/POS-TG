import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@renderer/lib/api'
import type { ProductDTO, CategoryDTO } from '@shared/ipc/contracts/catalog'

export function useCategories(): ReturnType<typeof useQuery<CategoryDTO[]>> {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.catalog.listCategories({})
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useProducts(input: {
  search?: string | undefined
  categoryId?: string | null | undefined
  activeOnly?: boolean | undefined
  limit?: number | undefined
  offset?: number | undefined
}): ReturnType<typeof useQuery<{ items: ProductDTO[]; total: number }>> {
  return useQuery({
    queryKey: ['products', input],
    queryFn: async () => {
      const args: Parameters<typeof api.catalog.listProducts>[0] = {
        activeOnly: input.activeOnly ?? false,
        limit: input.limit ?? 100,
        offset: input.offset ?? 0
      }
      if (input.search !== undefined) args.search = input.search
      if (input.categoryId !== undefined && input.categoryId !== null)
        args.categoryId = input.categoryId
      const res = await api.catalog.listProducts(args)
      if (!res.ok) throw new Error(res.error.message)
      return res.data
    }
  })
}

export function useCreateProduct(): ReturnType<
  typeof useMutation<ProductDTO, Error, Parameters<typeof api.catalog.createProduct>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.catalog.createProduct(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
    }
  })
}

export function useDeleteProduct(): ReturnType<
  typeof useMutation<
    { modo: 'eliminado' | 'desactivado'; message: string },
    Error,
    { sessionId: string; id: string }
  >
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.catalog.deleteProduct(input)
      // El máster manda mensajes ya redactados; se prefieren al código seco.
      if (!res.ok) throw new Error(res.error.message || res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
    }
  })
}

export function useUpdateProduct(): ReturnType<
  typeof useMutation<ProductDTO, Error, Parameters<typeof api.catalog.updateProduct>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.catalog.updateProduct(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
    }
  })
}

export function useCreateCategory(): ReturnType<
  typeof useMutation<
    CategoryDTO,
    Error,
    { name: string; parentId?: string | null; lowStockThreshold?: number | null }
  >
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.catalog.createCategory(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] })
    }
  })
}

export function useUpdateCategory(): ReturnType<
  typeof useMutation<CategoryDTO, Error, Parameters<typeof api.catalog.updateCategory>[0]>
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input) => {
      const res = await api.catalog.updateCategory(input)
      if (!res.ok) throw new Error(res.error.code)
      return res.data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] })
      void qc.invalidateQueries({ queryKey: ['inventory'] })
    }
  })
}
