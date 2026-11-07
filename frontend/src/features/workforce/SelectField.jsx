import FormField from '../../components/forms/FormField';

export default function SelectField({
  label,
  name,
  options,
  placeholder,
  defaultValue = '',
  hint,
  ...props
}) {
  return (
    <FormField label={label} hint={hint}>
      {(attributes) => (
        <select {...attributes} name={name} defaultValue={defaultValue} {...props}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
