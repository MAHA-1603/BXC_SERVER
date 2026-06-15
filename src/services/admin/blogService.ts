import { prisma } from "../../config/database";

export const createBlog = async (data: {
  title: string;
  content: string;
  summary?: string;
  featuredImage?: string;
  authorName: string;
  authorId: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string[];
  tags?: string[];
  categories?: string[];
}) => {
  const slug = data.title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Check if slug exists, if so append unique timestamp
  const existing = await prisma.blog.findUnique({ where: { slug } });
  const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

  return await prisma.blog.create({
    data: {
      ...data,
      slug: finalSlug,
    },
  });
};

export const getAllBlogs = async (page: number, limit: number) => {
  const blogs = await prisma.blog.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      authorAdmin: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  const total = await prisma.blog.count();

  return { blogs, total };
};

export const getBlogById = async (id: string) => {
  return await prisma.blog.findUnique({
    where: { id },
    include: {
      authorAdmin: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });
};

export const updateBlog = async (
  id: string,
  data: {
    title?: string;
    content?: string;
    summary?: string;
    featuredImage?: string;
    authorName?: string;
    metaTitle?: string;
    metaDescription?: string;
    metaKeywords?: string[];
    tags?: string[];
    categories?: string[];
    isPublished?: boolean;
  }
) => {
  let slugData = {};
  if (data.title) {
    const baseSlug = data.title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    
    const existing = await prisma.blog.findFirst({
      where: {
        slug: baseSlug,
        NOT: { id },
      },
    });
    
    const slug = existing ? `${baseSlug}-${Date.now()}` : baseSlug;
    slugData = { slug };
  }

  return await prisma.blog.update({
    where: { id },
    data: {
      ...data,
      ...slugData,
    },
  });
};

export const deleteBlog = async (id: string) => {
  return await prisma.blog.delete({
    where: { id },
  });
};

export const togglePublish = async (id: string, isPublished: boolean) => {
  return await prisma.blog.update({
    where: { id },
    data: { isPublished },
  });
};
