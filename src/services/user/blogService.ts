import { prisma } from "../../config/database";

export const getPublishedBlogs = async (page: number, limit: number) => {
  const blogs = await prisma.blog.findMany({
    where: { isPublished: true },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      summary: true,
      featuredImage: true,
      authorName: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      tags: true,
      categories: true,
      createdAt: true,
    },
  });

  const total = await prisma.blog.count({
    where: { isPublished: true },
  });

  return { blogs, total };
};

export const getBlogBySlug = async (slug: string) => {
  return await prisma.blog.findFirst({
    where: {
      slug,
      isPublished: true,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
      summary: true,
      featuredImage: true,
      authorName: true,
      metaTitle: true,
      metaDescription: true,
      metaKeywords: true,
      tags: true,
      categories: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};
