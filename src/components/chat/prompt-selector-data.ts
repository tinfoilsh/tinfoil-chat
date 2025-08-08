export type PromptCategory = {
  id: string
  label: string
  icon: 'write' | 'learn' | 'code' | 'life'
  prompts: {
    title: string
    prompt: string
  }[]
}

export const promptCategories: PromptCategory[] = [
  {
    id: 'writing',
    label: 'Write',
    icon: 'write',
    prompts: [
      {
        title: 'Develop character profiles',
        prompt:
          "I need help developing character profiles. Please ask me about the story genre, character role, and personality traits I'm envisioning. What other details would help you create a compelling character?",
      },
      {
        title: 'Create social media posts',
        prompt:
          "I need a social media post. Ask me about the platform and message I want to share. Don't hesitate to ask for examples or clarification!",
      },
      {
        title: 'Improve my writing style',
        prompt:
          'Can you help me improve my writing style? Start by asking me about the type of writing I do and what aspects I want to enhance. Feel free to ask for writing samples!',
      },
      {
        title: 'Develop podcast scripts',
        prompt:
          'Help me develop a podcast script. What questions do you have about the topic, audience, and episode length? Ask whatever you need to know!',
      },
      {
        title: 'Develop editorial guidelines',
        prompt:
          "I'm creating editorial guidelines. Please ask me about the publication type, target audience, and tone we want to maintain. The more context, the better!",
      },
    ],
  },
  {
    id: 'learning',
    label: 'Learn',
    icon: 'learn',
    prompts: [
      {
        title: 'Study Plan',
        prompt:
          "I need a study plan. Ask me what subject I'm learning and my current level. What other info would help you guide me?",
      },
      {
        title: 'Skill Development',
        prompt:
          'I want to learn something new. Start by asking what skill interests me and why. Feel free to ask about my experience level!',
      },
      {
        title: 'Research Help',
        prompt:
          "Can you help me research a topic? Ask me what I'm looking for and how deep I need to go. What questions will help you assist better?",
      },
      {
        title: 'Course Outline',
        prompt:
          'Help me create a learning outline. Please ask about my learning goals and available time. What else should I tell you?',
      },
      {
        title: 'Knowledge Gaps',
        prompt:
          "I need to identify what I don't know about a subject. Ask me about the topic and what I already understand. Keep the questions coming!",
      },
    ],
  },
  {
    id: 'technical',
    label: 'Code',
    icon: 'code',
    prompts: [
      {
        title: 'Code Review',
        prompt:
          "I need help with code. Ask me about the programming language and what I'm trying to achieve. What code should I share with you?",
      },
      {
        title: 'Design Feedback',
        prompt:
          "Can you help with design ideas? Start by asking what I'm designing and who it's for. What details would help you advise me?",
      },
      {
        title: 'Problem Solving',
        prompt:
          "I'm stuck on a technical problem. Please ask about the issue and what I've already tried. What context do you need?",
      },
      {
        title: 'Creative Brainstorm',
        prompt:
          'Help me brainstorm ideas. Ask me about the project and any constraints. Feel free to ask clarifying questions!',
      },
      {
        title: 'Process Improvement',
        prompt:
          'I want to improve a workflow. Start by asking about the current process and pain points. What information would help most?',
      },
    ],
  },
  {
    id: 'personal',
    label: 'Life',
    icon: 'life',
    prompts: [
      {
        title: 'Habit Building',
        prompt:
          'Help me build better habits. Ask me what I want to change and why. What about my current routine should you know?',
      },
      {
        title: 'Decision Making',
        prompt:
          'I need help making a decision. Please ask about my options and what matters most to me. Dig deeper with questions!',
      },
      {
        title: 'Time Management',
        prompt:
          'Can you help me manage my time better? Start by asking about my biggest time challenges. What else do you need to understand?',
      },
      {
        title: 'Productivity Boost',
        prompt:
          'I want to be more productive. Ask me about my work style and current obstacles. Feel free to ask specific questions!',
      },
      {
        title: 'Life Balance',
        prompt:
          'Help me find better work-life balance. What questions about my schedule and priorities would help you guide me?',
      },
    ],
  },
]
