import { ImageWithSkeleton } from '@/components/preview/image-with-skeleton'
import { Card } from '@/components/ui/card'
import { Check, Clock, Flame, Users } from 'lucide-react'
import React, { useState } from 'react'
import { coerceArray } from './input-coercion'

interface IngredientInput {
  quantity?: string
  item: string
  note?: string
}

interface StepInput {
  title?: string
  content: string
}

interface RecipeCardProps {
  title: string
  description?: string
  image?: string
  cuisine?: string
  difficulty?: 'easy' | 'medium' | 'hard'
  servings?: number | string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  ingredients?: unknown
  steps?: unknown
  tags?: unknown
  sourceUrl?: string
  source?: string
}

function normalizeIngredients(raw: unknown): IngredientInput[] {
  const list = coerceArray<unknown>(raw)
  const out: IngredientInput[] = []
  for (const entry of list) {
    if (typeof entry === 'string') {
      out.push({ item: entry })
      continue
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      const item =
        typeof e.item === 'string'
          ? e.item
          : typeof e.name === 'string'
            ? e.name
            : ''
      if (!item) continue
      out.push({
        item,
        quantity: typeof e.quantity === 'string' ? e.quantity : undefined,
        note: typeof e.note === 'string' ? e.note : undefined,
      })
    }
  }
  return out
}

function normalizeSteps(raw: unknown): StepInput[] {
  const list = coerceArray<unknown>(raw)
  const out: StepInput[] = []
  for (const entry of list) {
    if (typeof entry === 'string') {
      out.push({ content: entry })
      continue
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>
      const content =
        typeof e.content === 'string'
          ? e.content
          : typeof e.description === 'string'
            ? e.description
            : typeof e.text === 'string'
              ? e.text
              : ''
      if (!content) continue
      out.push({
        title: typeof e.title === 'string' ? e.title : undefined,
        content,
      })
    }
  }
  return out
}

function normalizeTags(raw: unknown): string[] {
  return coerceArray<unknown>(raw).filter(
    (item): item is string => typeof item === 'string' && item.length > 0,
  )
}

function difficultyLabel(value: RecipeCardProps['difficulty']): string | null {
  if (!value) return null
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function RecipeCard({
  title,
  description,
  image,
  cuisine,
  difficulty,
  servings,
  prepTime,
  cookTime,
  totalTime,
  ingredients,
  steps,
  tags,
  sourceUrl,
  source,
}: RecipeCardProps): React.JSX.Element {
  const ingredientItems = normalizeIngredients(ingredients)
  const stepItems = normalizeSteps(steps)
  const tagItems = normalizeTags(tags)
  const difficultyText = difficultyLabel(difficulty)

  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    () => new Set(),
  )
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => new Set(),
  )

  function toggle<T extends Set<number>>(
    set: T,
    index: number,
    setter: React.Dispatch<React.SetStateAction<T>>,
  ): void {
    setter((prev) => {
      const next = new Set(prev) as T
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const metaItems: Array<{ icon: typeof Clock; label: string; value: string }> =
    []
  if (prepTime) metaItems.push({ icon: Clock, label: 'Prep', value: prepTime })
  if (cookTime) metaItems.push({ icon: Flame, label: 'Cook', value: cookTime })
  if (totalTime && !prepTime && !cookTime)
    metaItems.push({ icon: Clock, label: 'Total', value: totalTime })
  if (servings !== undefined && servings !== '')
    metaItems.push({
      icon: Users,
      label: 'Serves',
      value: typeof servings === 'number' ? String(servings) : servings,
    })

  return (
    <Card className="my-3 max-w-2xl overflow-hidden">
      {image && (
        <ImageWithSkeleton
          src={image}
          alt={title}
          wrapperClassName="relative aspect-[16/9] w-full overflow-hidden bg-surface-card"
          className="h-full w-full object-cover"
          loading="lazy"
        />
      )}
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
            {cuisine && (
              <span className="uppercase tracking-wide">{cuisine}</span>
            )}
            {cuisine && difficultyText && <span>·</span>}
            {difficultyText && <span>{difficultyText}</span>}
          </div>
          <h3 className="text-lg font-semibold text-content-primary">
            {title}
          </h3>
          {description && (
            <p className="text-sm text-content-muted">{description}</p>
          )}
        </div>

        {metaItems.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {metaItems.map((m) => {
              const Icon = m.icon
              return (
                <div
                  key={m.label}
                  className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-1.5"
                >
                  <Icon className="h-3.5 w-3.5 text-content-muted" />
                  <span className="text-[11px] uppercase tracking-wide text-content-muted">
                    {m.label}
                  </span>
                  <span className="text-sm font-medium text-content-primary">
                    {m.value}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {ingredientItems.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              Ingredients
            </p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {ingredientItems.map((ingredient, i) => {
                const checked = checkedIngredients.has(i)
                return (
                  <li key={`${ingredient.item}-${i}`}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() =>
                        toggle(checkedIngredients, i, setCheckedIngredients)
                      }
                      className="flex w-full items-start gap-2 rounded-md px-2 py-1 text-left text-sm text-content-primary hover:bg-surface-chat-background"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                          checked
                            ? 'border-content-primary bg-content-primary text-surface-chat-background'
                            : 'border-border-subtle bg-transparent'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span
                        className={
                          checked
                            ? 'text-content-muted line-through'
                            : undefined
                        }
                      >
                        {ingredient.quantity && (
                          <span className="font-medium">
                            {ingredient.quantity}{' '}
                          </span>
                        )}
                        {ingredient.item}
                        {ingredient.note && (
                          <span className="text-xs text-content-muted">
                            {' '}
                            ({ingredient.note})
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {stepItems.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-content-muted">
              Steps
            </p>
            <ol className="flex flex-col gap-2">
              {stepItems.map((step, i) => {
                const done = completedSteps.has(i)
                return (
                  <li key={`step-${i}`}>
                    <button
                      type="button"
                      aria-pressed={done}
                      onClick={() =>
                        toggle(completedSteps, i, setCompletedSteps)
                      }
                      className="flex w-full items-start gap-3 rounded-lg border border-border-subtle bg-surface-chat-background px-3 py-2 text-left transition-colors hover:bg-surface-card"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${
                          done
                            ? 'border-content-primary bg-content-primary text-surface-chat-background'
                            : 'border-border-subtle bg-transparent text-content-muted'
                        }`}
                      >
                        {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        {step.title && (
                          <span
                            className={`text-sm font-medium ${done ? 'text-content-muted line-through' : 'text-content-primary'}`}
                          >
                            {step.title}
                          </span>
                        )}
                        <span
                          className={`text-sm ${done ? 'text-content-muted line-through' : 'text-content-primary'}`}
                        >
                          {step.content}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        )}

        {tagItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tagItems.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border-subtle bg-surface-chat-background px-2.5 py-0.5 text-[11px] text-content-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {(source || sourceUrl) && (
          <div className="border-t border-border-subtle pt-3 text-xs text-content-muted">
            Source:{' '}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-content-primary"
              >
                {source ?? sourceUrl}
              </a>
            ) : (
              <span>{source}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

export function validateRecipeCardProps(
  props: Record<string, unknown>,
): boolean {
  return typeof props.title === 'string' && props.title.length > 0
}
