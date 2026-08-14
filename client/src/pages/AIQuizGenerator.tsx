import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, CheckCircle2, Clock3, Sparkles, WandSparkles } from 'lucide-react';
import { useMetaTags } from '../hooks/useMetaTags';

const benefits = [
  ['Generate MCQ quizzes', 'Turn a topic into a ready-to-review multiple-choice quiz without writing every question manually.'],
  ['Publish online tests', 'Share quizzes with students on their devices and set an availability window and time limit.'],
  ['Grade automatically', 'Score objective questions instantly and review class and question-level performance.'],
];

const faq = [
  {
    question: 'What is the MathLogs AI quiz generator?',
    answer: 'It is a teacher-focused tool for creating multiple-choice quizzes from a topic, reviewing the questions, and publishing an online test to students.'
  },
  {
    question: 'Can students take the generated quiz online?',
    answer: 'Yes. Teachers can publish a quiz for students to attempt on their devices, with automatic scoring for objective questions.'
  },
  {
    question: 'Is it made for coaching institutes?',
    answer: 'Yes. It works alongside MathLogs coaching-management features such as student records, batches, tests, fees, and parent communication.'
  }
];

export default function AIQuizGenerator() {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'MathLogs AI Quiz Generator',
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Web',
      url: 'https://mathlogs.app/ai-quiz-generator',
      description: 'AI quiz generator for teachers and coaching institutes to create MCQ quizzes, publish online tests, automatically grade answers, and review analytics.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'INR',
        description: 'Free trial available'
      },
      featureList: ['AI-assisted MCQ generation', 'Online quiz publishing', 'Automatic grading', 'Quiz analytics']
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer }
      }))
    }
  ];

  useMetaTags({
    title: 'AI Quiz Generator for Teachers & Coaching Institutes | MathLogs',
    description: 'Create MCQ quizzes with AI, publish online tests, automatically grade answers, and analyze student performance. Built for teachers and coaching institutes.',
    canonicalPath: '/ai-quiz-generator',
    structuredData
  });

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-neutral-900">
      <header className="border-b border-neutral-200 bg-white/90 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-6xl mx-auto h-16 px-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-extrabold text-xl">
            <img src="/logo-64.webp" alt="MathLogs" width={34} height={34} className="rounded-xl" />
            MathLogs
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/coaching" className="hidden sm:inline text-sm font-bold text-neutral-600 hover:text-neutral-900">Find Coaching</Link>
            <Link to="/onboarding" className="px-4 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-bold">Try it free</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="px-5 py-20 sm:py-28 bg-white border-b border-neutral-200 overflow-hidden">
          <div className="max-w-5xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-100 text-xs font-extrabold mb-6">
              <Sparkles className="w-4 h-4" /> AI-powered assessment tools
            </div>
            <h1 className="text-4xl sm:text-6xl font-black tracking-[-0.045em] leading-[1.05] max-w-4xl mx-auto">
              AI quiz generator for teachers and coaching institutes
            </h1>
            <p className="mt-6 text-base sm:text-xl text-neutral-600 font-medium leading-relaxed max-w-3xl mx-auto">
              Create multiple-choice quizzes from a topic, review the questions, publish online tests, grade answers automatically, and understand student performance.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row justify-center gap-3">
              <Link to="/onboarding" className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-neutral-900 text-white font-extrabold shadow-lg">
                Generate your first quiz <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="inline-flex items-center justify-center px-7 py-4 rounded-full bg-white border border-neutral-300 font-extrabold">
                Sign in
              </Link>
            </div>
            <p className="mt-4 text-xs font-semibold text-neutral-500">14-day free trial · No credit card required</p>
          </div>
        </section>

        <section className="px-5 py-20" aria-labelledby="quiz-workflow">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-2xl">
              <p className="text-sm uppercase tracking-widest font-extrabold text-indigo-700">One simple workflow</p>
              <h2 id="quiz-workflow" className="mt-3 text-3xl sm:text-5xl font-black tracking-tight">From topic to online test in minutes</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5 mt-10">
              {benefits.map(([title, description], index) => {
                const Icon = index === 0 ? WandSparkles : index === 1 ? Clock3 : BarChart3;
                return (
                  <article key={title} className="bg-white rounded-3xl border border-neutral-200 p-7 shadow-sm">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-900 text-white flex items-center justify-center"><Icon className="w-6 h-6" /></div>
                    <h3 className="mt-6 text-xl font-extrabold">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-neutral-600 font-medium">{description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-5 py-20 bg-neutral-950 text-white">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-sm uppercase tracking-widest font-extrabold text-indigo-300">Built for real classrooms</p>
              <h2 className="mt-3 text-3xl sm:text-5xl font-black tracking-tight text-white">Quiz creation is only the beginning</h2>
              <p className="mt-5 text-neutral-300 leading-8 font-medium">MathLogs keeps the quiz connected to the rest of your coaching workflow, so you can manage assessments alongside batches and student records.</p>
            </div>
            <ul className="grid gap-4">
              {['Set quiz duration and availability', 'Share public or assigned online quizzes', 'Automatic objective-question scoring', 'Monitor submissions and review analytics'].map(item => (
                <li key={item} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4 font-bold">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="px-5 py-20 bg-white" aria-labelledby="quiz-faq">
          <div className="max-w-3xl mx-auto">
            <h2 id="quiz-faq" className="text-3xl sm:text-4xl font-black tracking-tight">AI quiz generator FAQs</h2>
            <div className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
              {faq.map(item => (
                <article key={item.question} className="py-6">
                  <h3 className="text-lg font-extrabold">{item.question}</h3>
                  <p className="mt-2 text-neutral-600 leading-7">{item.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="px-5 py-10 bg-white border-t border-neutral-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-4 justify-between text-sm font-semibold text-neutral-600">
          <span>© MathLogs</span>
          <div className="flex gap-5"><Link to="/coaching">Coaching marketplace</Link><Link to="/privacy-policy">Privacy</Link><Link to="/terms">Terms</Link></div>
        </div>
      </footer>
    </div>
  );
}
