-- =====================================================================
-- AI Fitness Platform — Reference seed data (exercise catalog)
-- ---------------------------------------------------------------------
-- User-independent reference data only. Demo accounts + demo logs are
-- created by the backend seed script (npm run seed) so that passwords
-- are hashed with bcrypt rather than stored as literals.
-- Idempotent: re-running updates the catalog in place.
-- =====================================================================

INSERT INTO exercises (name, muscle_group, category, equipment, difficulty, met, instructions) VALUES
  ('Push-up',              'chest',     'strength', 'bodyweight', 'Beginner',     8.0, 'Keep a straight line head to heels; lower until elbows reach 90°.'),
  ('Incline Dumbbell Press','chest',    'strength', 'dumbbell',   'Intermediate', 6.0, 'Press dumbbells up over the upper chest on a 30° bench.'),
  ('Bench Press',          'chest',     'strength', 'barbell',    'Advanced',     6.0, 'Lower the bar to mid-chest, drive up while keeping shoulder blades retracted.'),
  ('Pull-up',              'back',      'strength', 'bodyweight', 'Advanced',     8.0, 'Pull chin over the bar from a dead hang; control the descent.'),
  ('Bent-over Row',        'back',      'strength', 'barbell',    'Intermediate', 6.0, 'Hinge at the hips, row the bar to the lower ribs, squeeze the shoulder blades.'),
  ('Lat Pulldown',         'back',      'strength', 'machine',    'Beginner',     5.0, 'Pull the bar to the upper chest, leading with the elbows.'),
  ('Bodyweight Squat',     'legs',      'strength', 'bodyweight', 'Beginner',     5.0, 'Sit back to parallel keeping the chest up and knees tracking the toes.'),
  ('Barbell Back Squat',   'legs',      'strength', 'barbell',    'Advanced',     6.0, 'Brace the core, descend to parallel, drive through mid-foot.'),
  ('Walking Lunge',        'legs',      'strength', 'bodyweight', 'Intermediate', 6.0, 'Step forward into a lunge; keep the front knee over the ankle.'),
  ('Romanian Deadlift',    'legs',      'strength', 'barbell',    'Intermediate', 6.0, 'Hinge at the hips with soft knees; feel the hamstring stretch.'),
  ('Overhead Press',       'shoulders', 'strength', 'barbell',    'Intermediate', 6.0, 'Press the bar overhead, finishing with biceps by the ears.'),
  ('Lateral Raise',        'shoulders', 'strength', 'dumbbell',   'Beginner',     4.0, 'Raise dumbbells to shoulder height with a slight bend in the elbows.'),
  ('Bicep Curl',           'arms',      'strength', 'dumbbell',   'Beginner',     4.0, 'Curl with the elbows pinned to the sides; avoid swinging.'),
  ('Tricep Dip',           'arms',      'strength', 'bodyweight', 'Intermediate', 5.0, 'Lower until elbows reach 90°, keeping the torso upright.'),
  ('Plank',                'core',      'strength', 'bodyweight', 'Beginner',     4.0, 'Hold a straight line on the forearms; brace the abs and glutes.'),
  ('Hanging Leg Raise',    'core',      'strength', 'bodyweight', 'Advanced',     5.0, 'Raise the legs to hip height without swinging.'),
  ('Mountain Climber',     'core',      'cardio',   'bodyweight', 'Intermediate', 8.0, 'Drive the knees toward the chest in a fast plank position.'),
  ('Burpee',               'full_body', 'cardio',   'bodyweight', 'Advanced',    10.0, 'Squat, kick back to a push-up, jump up explosively.'),
  ('Jumping Jacks',        'full_body', 'cardio',   'bodyweight', 'Beginner',     8.0, 'Jump while raising arms overhead and spreading the feet.'),
  ('Kettlebell Swing',     'full_body', 'cardio',   'kettlebell', 'Intermediate', 9.0, 'Hinge and snap the hips to swing the bell to chest height.'),
  ('Running',              'cardio',    'cardio',   'none',       'Intermediate', 9.8, 'Maintain a steady conversational pace; land mid-foot.'),
  ('Brisk Walking',        'cardio',    'cardio',   'none',       'Beginner',     4.3, 'Walk briskly with an upright posture and active arm swing.'),
  ('Cycling',              'cardio',    'cardio',   'machine',    'Beginner',     7.5, 'Maintain a steady cadence of 80-90 rpm.'),
  ('Jump Rope',            'cardio',    'cardio',   'rope',       'Intermediate', 11.0,'Stay light on the balls of the feet with small wrist turns.'),
  ('Rowing Machine',       'cardio',    'cardio',   'machine',    'Intermediate', 7.0, 'Drive with the legs, then the back, then the arms.'),
  ('Cat-Cow Stretch',      'core',      'mobility', 'bodyweight', 'Beginner',     2.5, 'Alternate arching and rounding the spine with the breath.'),
  ('World''s Greatest Stretch','full_body','mobility','bodyweight','Beginner',    3.0, 'Lunge, rotate the torso, and reach to open the hips and spine.')
ON CONFLICT (name) DO UPDATE SET
  muscle_group = EXCLUDED.muscle_group,
  category     = EXCLUDED.category,
  equipment    = EXCLUDED.equipment,
  difficulty   = EXCLUDED.difficulty,
  met          = EXCLUDED.met,
  instructions = EXCLUDED.instructions;
